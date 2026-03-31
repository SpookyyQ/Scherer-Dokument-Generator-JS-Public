# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
Python print bridge for Electron app.
Reuses the proven PySide printing behavior for label/board/checklist.
Outputs exactly one JSON object on stdout.
"""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"


def _hidden_subprocess_kwargs():
    if sys.platform != "win32":
        return {}
    kwargs = {}
    create_no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    if create_no_window:
        kwargs["creationflags"] = create_no_window
    startupinfo_cls = getattr(subprocess, "STARTUPINFO", None)
    if startupinfo_cls is not None:
        startupinfo = startupinfo_cls()
        startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0)
        kwargs["startupinfo"] = startupinfo
    return kwargs


def _log(lines, msg):
    lines.append(str(msg))


def _ps(script, timeout=30):
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
            "$OutputEncoding = [System.Text.Encoding]::UTF8; " + script,
        ],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        **_hidden_subprocess_kwargs(),
    )


def _ist_ip(text):
    return bool(re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", str(text or "").strip()))


def _hole_drucker_liste(log=None):
    r = _ps(
        "Get-Printer | ForEach-Object { "
        "  $pname = $_.PortName; "
        "  $port = Get-PrinterPort -Name $pname -ErrorAction SilentlyContinue; "
        "  $phost = if($port -and $port.PrinterHostAddress) { $port.PrinterHostAddress } else { '' }; "
        "  Write-Output ($_.Name + '|' + $pname + '|' + $phost + '|' + $_.DriverName) "
        "}",
        timeout=25,
    )
    if r.returncode != 0 and log is not None:
        _log(log, f"  PowerShell-Fehler: {(r.stderr or '').strip()[:220]}")

    daten = []
    for zeile in (r.stdout or "").splitlines():
        teile = zeile.strip().split("|")
        if len(teile) < 4:
            continue
        name, port, host, treiber = [t.strip() for t in teile[:4]]
        if not name:
            continue
        daten.append({"name": name, "port": port, "host": host, "driver": treiber})
    return daten


def _drucker_name(identifier, log):
    ident = str(identifier or "").strip()
    if not ident:
        _log(log, "  FEHLER: Kein Drucker-Name/IP angegeben.")
        return None

    _log(log, f"  Suche Drucker fuer '{ident}' ...")
    try:
        drucker = _hole_drucker_liste(log)
        if not drucker:
            _log(log, "  FEHLER: Keine installierten Drucker gefunden.")
            return None

        exakt = [d for d in drucker if d["name"].lower() == ident.lower()]
        if exakt:
            _log(log, f"  -> '{exakt[0]['name']}' [exakter Name]")
            return exakt[0]["name"]

        if _ist_ip(ident):
            kandidaten = [d for d in drucker if ident in d["port"] or ident in d["host"] or ident in d["name"]]
            if kandidaten:
                kandidaten.sort(
                    key=lambda d: (
                        0 if d["host"] == ident else 1,
                        0 if ident in d["port"] else 1,
                        0 if "ipp" in d["port"].lower() else 1,
                        d["name"].lower(),
                    )
                )
                d = kandidaten[0]
                _log(log, f"  -> '{d['name']}' [Port={d['port']}, Host={d['host'] or '-'}]")
                return d["name"]

        teil = [d for d in drucker if ident.lower() in d["name"].lower()]
        if teil:
            _log(log, f"  -> '{teil[0]['name']}' [Teilstring-Match]")
            return teil[0]["name"]
    except Exception as e:
        _log(log, f"  Druckersuche Fehler: {e}")

    _log(log, f"  FEHLER: Kein Drucker fuer '{ident}' gefunden.")
    try:
        r2 = _ps("Get-Printer | Select-Object Name,PortName,DriverName | Format-Table -AutoSize")
        for zeile in (r2.stdout or "").splitlines():
            if zeile.strip():
                _log(log, f"    {zeile.strip()}")
    except Exception:
        pass
    return None


def _ist_kyocera_treiber(d):
    name = str((d or {}).get("name", "")).lower()
    driver = str((d or {}).get("driver", "")).lower()
    return ("kyocera" in name) or ("kyocera" in driver)


def _erzwinge_kyocera_drucker(drucker_name, log):
    try:
        liste = _hole_drucker_liste(log)
    except Exception:
        liste = []
    if not liste:
        _log(log, "  FEHLER: Keine installierten Drucker gefunden.")
        return None

    chosen = None
    for d in liste:
        if str(d.get("name", "")).strip().lower() == str(drucker_name or "").strip().lower():
            chosen = d
            break

    if chosen and _ist_kyocera_treiber(chosen):
        return chosen["name"]

    kyocera = [d for d in liste if _ist_kyocera_treiber(d)]
    if kyocera:
        ersatz = kyocera[0]["name"]
        if chosen:
            _log(
                log,
                f"  Hinweis: '{chosen.get('name')}' nutzt keinen Kyocera-Treiber. "
                f"Wechsle auf '{ersatz}'.",
            )
        else:
            _log(log, f"  Hinweis: Nutze Kyocera-Drucker '{ersatz}'.")
        return ersatz

    _log(log, "  FEHLER: Kein Drucker mit Kyocera-Treiber gefunden.")
    return None


def _setze_duplex(drucker, modus, log):
    if not drucker:
        return
    try:
        r = _ps(
            f'Set-PrintConfiguration -PrinterName "{drucker}" '
            f"-DuplexingMode {modus} -ErrorAction SilentlyContinue; "
            'Write-Output "OK"'
        )
        _log(log, f"  Duplex {modus}: {(r.stdout or '').strip()[:80]}")
    except Exception as e:
        _log(log, f"  Duplex Fehler: {e}")


def _setze_papier(drucker, papier, log):
    if not drucker:
        return
    try:
        r = _ps(
            f'Set-PrintConfiguration -PrinterName "{drucker}" '
            f"-PaperSize {papier} -ErrorAction SilentlyContinue; "
            'Write-Output "OK"'
        )
        _log(log, f"  Papier {papier}: {(r.stdout or '').strip()[:80]}")
    except Exception as e:
        _log(log, f"  Papier Fehler: {e}")


def _soffice_ok():
    return Path(SOFFICE).exists()


def _win32_ok():
    try:
        import win32com.client  # noqa: F401
        import win32print  # noqa: F401
        return True
    except Exception:
        return False


def _mit_default_printer(drucker, action, log, before_action=None):
    import win32print

    alt = None
    try:
        alt = win32print.GetDefaultPrinter()
    except Exception:
        alt = None
    try:
        if drucker and alt and alt != drucker:
            win32print.SetDefaultPrinter(drucker)
        if before_action is not None:
            before_action()
        return action()
    finally:
        try:
            if alt and alt != drucker:
                win32print.SetDefaultPrinter(alt)
        except Exception as e:
            _log(log, f"  WARNUNG: Default-Drucker konnte nicht zurueckgesetzt werden: {e}")


def drucke_label(pfad, drucker_id):
    log = []
    pfad = Path(pfad)
    _log(log, "=== LABEL DRUCKEN ===")
    _log(log, f"  Datei:   {pfad.name}")
    if not pfad.exists():
        _log(log, "  FEHLER: Datei nicht gefunden.")
        return False, "\n".join(log)

    drucker = _drucker_name(drucker_id, log)
    if not drucker:
        return False, "\n".join(log)

    _setze_duplex(drucker, "OneSided", log)
    _setze_papier(drucker, "A4", log)

    if _soffice_ok():
        _log(log, f"  LibreOffice -> '{drucker}'")
        try:
            r = subprocess.run(
                [SOFFICE, "--headless", "--pt", drucker, str(pfad)],
                capture_output=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                **_hidden_subprocess_kwargs(),
            )
            _log(log, f"  RC={r.returncode}")
            if (r.stderr or "").strip():
                _log(log, f"  stderr: {(r.stderr or '').strip()[:180]}")
            if r.returncode == 0:
                _log(log, "  -> ERFOLGREICH (LibreOffice)")
                return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  LibreOffice Fehler: {e}")

    if _win32_ok():
        _log(log, f"  win32com Word -> '{drucker}'")
        try:
            import win32com.client

            def _do_print():
                word = win32com.client.Dispatch("Word.Application")
                word.Visible = False
                doc = word.Documents.Open(str(pfad.resolve()), ReadOnly=True)
                doc.PrintOut(Background=False)
                time.sleep(3)
                doc.Close(False)
                word.Quit()

            _mit_default_printer(drucker, _do_print, log)
            _log(log, "  -> ERFOLGREICH (win32com Word)")
            return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  win32com Fehler: {e}")

    _log(log, "  FEHLGESCHLAGEN")
    return False, "\n".join(log)


def drucke_boardkarte(pfad, drucker_id):
    log = []
    pfad = Path(pfad)
    _log(log, "=== BOARDKARTE DRUCKEN ===")
    _log(log, f"  Datei:   {pfad.name}")
    if not pfad.exists():
        _log(log, "  FEHLER: Datei nicht gefunden.")
        return False, "\n".join(log)

    drucker = _drucker_name(drucker_id, log)
    if not drucker:
        return False, "\n".join(log)
    drucker = _erzwinge_kyocera_drucker(drucker, log)
    if not drucker:
        return False, "\n".join(log)

    _setze_duplex(drucker, "TwoSidedShortEdge", log)
    _setze_papier(drucker, "A4", log)

    if _win32_ok():
        _log(log, f"  win32com Excel -> '{drucker}'")
        try:
            import win32com.client

            def _prepare_print():
                _setze_duplex(drucker, "TwoSidedShortEdge", log)
                _setze_papier(drucker, "A4", log)
                time.sleep(0.6)

            def _do_print():
                excel = win32com.client.Dispatch("Excel.Application")
                excel.Visible = False
                excel.DisplayAlerts = False
                wb = excel.Workbooks.Open(str(pfad.resolve()), ReadOnly=True)
                wb.Worksheets.Select()
                excel.ActiveWindow.SelectedSheets.PrintOut(Copies=1, Collate=True)
                time.sleep(3)
                wb.Close(False)
                excel.Quit()

            _mit_default_printer(drucker, _do_print, log, before_action=_prepare_print)
            _log(log, "  -> ERFOLGREICH (win32com Excel)")
            return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  win32com Fehler: {e}")

    if _soffice_ok():
        _log(log, f"  LibreOffice -> '{drucker}'")
        try:
            r = subprocess.run(
                [SOFFICE, "--headless", "--pt", drucker, str(pfad)],
                capture_output=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                **_hidden_subprocess_kwargs(),
            )
            _log(log, f"  RC={r.returncode}")
            if (r.stderr or "").strip():
                _log(log, f"  stderr: {(r.stderr or '').strip()[:180]}")
            if r.returncode == 0:
                _log(log, "  -> ERFOLGREICH (LibreOffice)")
                return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  LibreOffice Fehler: {e}")

    _log(log, "  FEHLGESCHLAGEN")
    return False, "\n".join(log)


def drucke_checkliste(pfad, drucker_id):
    log = []
    pfad = Path(pfad)
    _log(log, "=== CHECKLISTE DRUCKEN ===")
    _log(log, f"  Datei:   {pfad.name}")
    if not pfad.exists():
        _log(log, "  FEHLER: Datei nicht gefunden.")
        return False, "\n".join(log)

    drucker = _drucker_name(drucker_id, log)
    if not drucker:
        return False, "\n".join(log)
    drucker = _erzwinge_kyocera_drucker(drucker, log)
    if not drucker:
        return False, "\n".join(log)

    _setze_duplex(drucker, "OneSided", log)
    _setze_papier(drucker, "A4", log)

    sumatra = next(
        (
            p
            for p in [
                r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
                r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
                str(Path.home() / "AppData" / "Local" / "SumatraPDF" / "SumatraPDF.exe"),
            ]
            if Path(p).exists()
        ),
        None,
    )

    if sumatra:
        _log(log, f"  SumatraPDF -> '{drucker}'")
        try:
            r = subprocess.run(
                [
                    sumatra,
                    "-print-to",
                    drucker,
                    "-print-settings",
                    "1x,fit,portrait,simplex",
                    "-silent",
                    str(pfad),
                ],
                capture_output=True,
                encoding="utf-8",
                errors="replace",
                timeout=90,
                **_hidden_subprocess_kwargs(),
            )
            _log(log, f"  RC={r.returncode}")
            if (r.stderr or "").strip():
                _log(log, f"  stderr: {(r.stderr or '').strip()[:180]}")
            if r.returncode == 0:
                _log(log, "  -> ERFOLGREICH (SumatraPDF)")
                return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  SumatraPDF Fehler: {e}")

    if _soffice_ok():
        _log(log, f"  LibreOffice PDF -> '{drucker}'")
        try:
            r = subprocess.run(
                [SOFFICE, "--headless", "--pt", drucker, str(pfad)],
                capture_output=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                **_hidden_subprocess_kwargs(),
            )
            _log(log, f"  RC={r.returncode}")
            if (r.stderr or "").strip():
                _log(log, f"  stderr: {(r.stderr or '').strip()[:180]}")
            if r.returncode == 0:
                _log(log, "  -> ERFOLGREICH (LibreOffice)")
                return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  LibreOffice Fehler: {e}")

    if _win32_ok():
        _log(log, f"  win32com Word (PDF) -> '{drucker}'")
        try:
            import win32com.client

            def _do_print():
                word = win32com.client.Dispatch("Word.Application")
                word.Visible = False
                doc = word.Documents.Open(str(pfad.resolve()), ReadOnly=True)
                doc.PrintOut(Background=False)
                time.sleep(3)
                doc.Close(False)
                word.Quit()

            _mit_default_printer(drucker, _do_print, log)
            _log(log, "  -> ERFOLGREICH (win32com Word)")
            return True, "\n".join(log)
        except Exception as e:
            _log(log, f"  win32com Fehler: {e}")

    _log(log, "  FEHLGESCHLAGEN")
    return False, "\n".join(log)


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", required=True, choices=["label", "board", "checklist"])
    parser.add_argument("--file", required=True)
    parser.add_argument("--printer", default="")
    args = parser.parse_args()

    try:
        if args.action == "label":
            ok, log = drucke_label(args.file, args.printer)
        elif args.action == "board":
            ok, log = drucke_boardkarte(args.file, args.printer)
        else:
            ok, log = drucke_checkliste(args.file, args.printer)

        print(json.dumps({"ok": bool(ok), "log": log}, ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "log": f"Bridge-Fehler: {e}"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(_main())
