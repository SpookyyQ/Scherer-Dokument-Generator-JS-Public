const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const { cleanText, normSeriennummer, normIdnr } = require("./utils");

class DataProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "DataProviderError";
  }
}

function parseCsvLine(line, delimiter = ",", quote = "'") {
  const out = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === quote) {
      if (inQuote && line[i + 1] === quote) {
        current += quote;
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (ch === delimiter && !inQuote) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function parseCsvContent(raw) {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line) => parseCsvLine(line));
}

function buildLagerIndex(records) {
  const exact = {};
  const suffix = {};
  const idnr = {};

  for (const rec of records) {
    const entry = {
      idnr: rec.idnr,
      modell: rec.modell,
      seriennr: rec.seriennr,
      techniker: rec.techniker || "",
    };

    if (!exact[entry.seriennr]) {
      exact[entry.seriennr] = [];
    }
    exact[entry.seriennr].push(entry);

    if (entry.seriennr.length >= 5) {
      const suf = entry.seriennr.slice(-5);
      if (!suffix[suf]) {
        suffix[suf] = [];
      }
      suffix[suf].push(entry);
    }

    if (!idnr[entry.idnr]) {
      idnr[entry.idnr] = [];
    }
    idnr[entry.idnr].push(entry);
  }

  return { exact, suffix, idnr };
}

class DataProvider {
  async loadRecords() {
    throw new Error("Not implemented");
  }

  async loadIndex() {
    const { records, source } = await this.loadRecords();
    return { index: buildLagerIndex(records), source };
  }
}

class TxtDataProvider extends DataProvider {
  constructor(candidates) {
    super();
    this.candidates = (candidates || []).filter(Boolean).map((p) => path.resolve(p));
  }

  async loadRecords() {
    for (const file of this.candidates) {
      if (!fs.existsSync(file)) {
        continue;
      }
      try {
        const raw = fs.readFileSync(file, "utf8");
        const records = this.parseTxt(raw);
        if (records.length > 0) {
          return { records, source: file };
        }
      } catch (_) {
        // try next candidate
      }
    }

    return { records: [], source: null };
  }

  parseTxt(rawText) {
    const rows = parseCsvContent(rawText);
    if (rows.length === 0) {
      return [];
    }

    const header = rows[0].map((x) => cleanText(x));
    const colMap = {};
    header.forEach((name, idx) => {
      colMap[name.toLowerCase()] = idx;
    });

    const idx = (...names) => {
      for (const name of names) {
        const key = String(name).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(colMap, key)) {
          return colMap[key];
        }
      }
      return null;
    };

    const iIdnr = idx("IDNR", "IDNR_Hauptgeraet");
    const iModelLong = idx("Bezeichnung");
    const iModelShort = idx("ModellBezeichnung");
    const iSerial = idx("Serien_Nr", "Seriennummer", "Seriennr");
    const iTech = idx("Techniker", "Name");

    if (iIdnr == null || iSerial == null) {
      return [];
    }

    const records = [];

    for (const row of rows.slice(1)) {
      if (!row || row.length === 0) {
        continue;
      }

      const idnr = iIdnr < row.length ? normIdnr(row[iIdnr]) : "";
      const seriennr = iSerial < row.length ? normSeriennummer(row[iSerial]) : "";
      if (!idnr || !seriennr) {
        continue;
      }

      let modell = "";
      // Prefer the full device name from Lager ("Bezeichnung"), short code only as fallback.
      if (iModelLong != null && iModelLong < row.length) {
        modell = cleanText(row[iModelLong]);
      }
      if (!modell && iModelShort != null && iModelShort < row.length) {
        modell = cleanText(row[iModelShort]);
      }

      let techniker = "";
      if (iTech != null && iTech < row.length) {
        techniker = cleanText(row[iTech]);
        if (techniker === "0") {
          techniker = "";
        }
      }

      records.push({ idnr, modell, seriennr, techniker });
    }

    return records;
  }
}

class SqlDataProvider extends DataProvider {
  constructor({
    connection,
    query = "SELECT idnr, modell, seriennr, techniker FROM lager",
    idnrCol = "idnr",
    modellCol = "modell",
    serienCol = "seriennr",
    technikerCol = "techniker",
  }) {
    super();
    this.connection = String(connection || "").trim();
    this.query = query;
    this.idnrCol = idnrCol;
    this.modellCol = modellCol;
    this.serienCol = serienCol;
    this.technikerCol = technikerCol;
  }

  resolveSqlitePath() {
    const conn = this.connection;
    if (conn.toLowerCase().startsWith("sqlite:///")) {
      return conn.slice("sqlite:///".length);
    }
    if (conn.toLowerCase().endsWith(".db") || conn.toLowerCase().endsWith(".sqlite")) {
      return conn;
    }
    throw new DataProviderError(
      "SQL-Connection aktuell nur für SQLite vorbereitet. Nutze z.B. 'sqlite:///C:/pfad/lager.db'.",
    );
  }

  async loadRecords() {
    const dbPath = this.resolveSqlitePath();

    const rows = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (openErr) => {
        if (openErr) {
          reject(openErr);
        }
      });

      db.all(this.query, [], (err, resultRows) => {
        db.close(() => {
          if (err) {
            reject(err);
          } else {
            resolve(resultRows || []);
          }
        });
      });
    }).catch((err) => {
      throw new DataProviderError(`SQL-Lesen fehlgeschlagen: ${err.message || String(err)}`);
    });

    const records = [];
    for (const row of rows) {
      try {
        const idnr = normIdnr(row[this.idnrCol]);
        const seriennr = normSeriennummer(row[this.serienCol]);
        if (!idnr || !seriennr) {
          continue;
        }
        const modell = cleanText(row[this.modellCol]);
        const techniker = Object.prototype.hasOwnProperty.call(row, this.technikerCol)
          ? cleanText(row[this.technikerCol])
          : "";
        records.push({ idnr, modell, seriennr, techniker });
      } catch (_) {
        // skip row
      }
    }

    return { records, source: this.connection };
  }
}

module.exports = {
  DataProviderError,
  DataProvider,
  TxtDataProvider,
  SqlDataProvider,
  buildLagerIndex,
};
