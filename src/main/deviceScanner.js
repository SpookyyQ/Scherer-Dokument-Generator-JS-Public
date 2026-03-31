const ping = require("ping");
const snmp = require("net-snmp");

const {
  cleanText,
  normSeriennummer,
  extractIpv4,
} = require("./utils");

function ipToInt(ip) {
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join(".");
}

function parseCidr(cidr) {
  const text = cleanText(cidr);
  if (!text) {
    return [];
  }

  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const hosts = [];
  const seen = new Set();

  for (const part of parts) {
    const [ip, maskStr] = part.split("/");
    const base = ipToInt(ip || "");
    const mask = Number(maskStr);

    if (!Number.isInteger(base) || !Number.isInteger(mask) || mask < 0 || mask > 32) {
      continue;
    }

    const hostBits = 32 - mask;
    const netMask = mask === 0 ? 0 : ((0xffffffff << hostBits) >>> 0);
    const network = base & netMask;
    const total = mask >= 31 ? 1 : (2 ** hostBits) - 2;

    for (let i = 1; i <= total; i += 1) {
      const candidate = intToIp((network + i) >>> 0);
      if (!seen.has(candidate)) {
        seen.add(candidate);
        hosts.push(candidate);
      }
      if (hosts.length >= 2048) {
        return hosts;
      }
    }

    if (mask >= 31) {
      const candidate = intToIp(network >>> 0);
      if (!seen.has(candidate)) {
        seen.add(candidate);
        hosts.push(candidate);
      }
    }
  }

  return hosts;
}

async function runPool(items, worker, maxWorkers, progressCb = null) {
  const results = [];
  let index = 0;
  let done = 0;

  async function runNext() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }

      const item = items[current];
      let result = null;
      try {
        result = await worker(item, current);
      } catch (_) {
        result = null;
      }

      done += 1;
      if (progressCb && (done === 1 || done % 20 === 0 || done === items.length)) {
        progressCb(done, items.length);
      }

      if (result) {
        results.push(result);
      }
    }
  }

  const workers = [];
  const count = Math.max(1, Math.min(maxWorkers, items.length));
  for (let i = 0; i < count; i += 1) {
    workers.push(runNext());
  }

  await Promise.all(workers);
  return results;
}

async function pingHost(host) {
  const target = cleanText(host);
  if (!target) {
    return false;
  }

  try {
    const res = await ping.promise.probe(target, {
      timeout: 1,
      extra: ["-n", "1", "-w", "700"],
      min_reply: 1,
    });
    return Boolean(res.alive);
  } catch (_) {
    return false;
  }
}

function snmpText(value) {
  if (value == null) {
    return "";
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8").trim();
  }

  return String(value).trim();
}

function snmpMac(value) {
  if (!value) {
    return "";
  }

  if (Buffer.isBuffer(value)) {
    if (value.length === 0 || [...value].every((x) => x === 0)) {
      return "";
    }
    return [...value].map((x) => x.toString(16).padStart(2, "0").toUpperCase()).join(":");
  }

  const text = String(value).trim();
  if (text.includes(":")) {
    return text;
  }

  return "";
}

function snmpGet(host, oid, timeout = 900) {
  return new Promise((resolve) => {
    const session = snmp.createSession(host, "public", { timeout, retries: 0, version: snmp.Version2c });
    session.get([oid], (err, varbinds) => {
      try {
        if (err || !varbinds || !varbinds[0] || snmp.isVarbindError(varbinds[0])) {
          resolve(null);
        } else {
          resolve(varbinds[0].value);
        }
      } finally {
        session.close();
      }
    });
  });
}

function snmpWalkMac(host, oid, timeout = 900) {
  return new Promise((resolve) => {
    const session = snmp.createSession(host, "public", { timeout, retries: 0, version: snmp.Version2c });
    let mac = "";

    session.subtree(
      oid,
      (varbinds) => {
        for (const vb of varbinds || []) {
          if (snmp.isVarbindError(vb)) {
            continue;
          }
          const candidate = snmpMac(vb.value);
          if (candidate) {
            mac = candidate;
            return;
          }
        }
      },
      (err) => {
        session.close();
        if (err) {
          resolve("");
        } else {
          resolve(mac);
        }
      },
    );
  });
}

async function snmpProbe(host) {
  const out = { model: "", serial: "", mac: "" };

  const serialVal = await snmpGet(host, "1.3.6.1.2.1.43.5.1.1.17.1");
  out.serial = snmpText(serialVal);
  if (!out.serial) {
    return out;
  }

  let modelVal = await snmpGet(host, "1.3.6.1.2.1.43.5.1.1.16.1");
  if (!modelVal) {
    modelVal = await snmpGet(host, "1.3.6.1.2.1.1.1.0");
  }
  out.model = snmpText(modelVal);

  out.mac = await snmpWalkMac(host, "1.3.6.1.2.1.2.2.1.6");
  return out;
}

function getLagerMatch(lagerData, serial) {
  if (!serial) {
    return null;
  }

  const exact = (lagerData?.exact?.[serial] || []);
  if (exact.length === 1) {
    return exact[0];
  }

  if (serial.length >= 5) {
    const suffix = (lagerData?.suffix?.[serial.slice(-5)] || []);
    if (suffix.length === 1) {
      return suffix[0];
    }
  }

  return null;
}

async function scanSingleTarget(printerLike, lagerData) {
  const printerName = cleanText(printerLike.name);
  const host = cleanText(printerLike.host) || extractIpv4(printerLike.port);
  if (!host) {
    return null;
  }

  const reachable = printerLike._alive ? true : await pingHost(host);
  let snmpData = { model: "", serial: "", mac: "" };

  if (reachable) {
    try {
      snmpData = await snmpProbe(host);
    } catch (_) {
      snmpData = { model: "", serial: "", mac: "" };
    }
  }

  const serial = normSeriennummer(snmpData.serial);
  const rec = getLagerMatch(lagerData, serial);

  return {
    key: host || printerName,
    printer_name: printerName,
    host,
    port: cleanText(printerLike.port),
    driver: cleanText(printerLike.driver),
    modell: cleanText(rec?.modell),
    snmp_modell: cleanText(snmpData.model),
    idnr: cleanText(rec?.idnr),
    seriennr: serial,
    mac: cleanText(snmpData.mac),
    techniker: cleanText(rec?.techniker),
    lager_match: Boolean(rec),
    serial_found: Boolean(serial),
    mac_found: Boolean(snmpData.mac),
    online: Boolean(reachable),
    last_seen: Date.now() / 1000,
  };
}

async function discoverAliveHosts(cidr, progress = null) {
  const hosts = parseCidr(cidr);
  if (hosts.length === 0) {
    return [];
  }

  const aliveEntries = await runPool(
    hosts,
    async (ip) => {
      const ok = await pingHost(ip);
      return ok ? ip : null;
    },
    Math.min(64, Math.max(12, Math.floor(hosts.length / 10) || 1)),
    (done, total) => {
      if (progress) {
        progress(`Netzwerkbereich wird geprüft (${done}/${total}) ...`);
      }
    },
  );

  return aliveEntries.sort((a, b) => ipToInt(a) - ipToInt(b));
}

async function scanDevices({ printers = [], lagerData = null, networkCidr = "", onProgress = null }) {
  const targets = new Map();

  for (const p of printers) {
    const host = cleanText(p.host) || extractIpv4(p.port);
    if (!host) {
      continue;
    }
    targets.set(host.toLowerCase(), { ...p, host });
  }

  if (cleanText(networkCidr)) {
    const aliveHosts = await discoverAliveHosts(networkCidr, onProgress);
    for (const ip of aliveHosts) {
      const key = ip.toLowerCase();
      if (!targets.has(key)) {
        targets.set(key, {
          name: `Netzwerkgerät ${ip}`,
          host: ip,
          port: ip,
          driver: "",
          _alive: true,
        });
      } else {
        const existing = targets.get(key);
        targets.set(key, { ...existing, _alive: true });
      }
    }
  }

  const allTargets = [...targets.values()];
  if (allTargets.length === 0) {
    return [];
  }

  const devices = await runPool(
    allTargets,
    async (p) => scanSingleTarget(p, lagerData),
    Math.min(24, Math.max(6, allTargets.length)),
    (done, total) => {
      if (onProgress && (done === 1 || done % 5 === 0 || done === total)) {
        onProgress(`SNMP-Abfrage läuft (${done}/${total}) ...`);
      }
    },
  );

  return devices;
}

module.exports = {
  parseCidr,
  scanDevices,
};
