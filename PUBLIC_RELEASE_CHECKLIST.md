# Public Release Checklist

Vor dem Veröffentlichen als Public-Repo prüfen:

- Keine echten Kundendaten in `Lager.txt` (nur Demo-Daten).
- Echte Daten nur lokal in `Lager.local.txt` verwenden.
- Keine Firmware-/Treiber-/Zertifikat-Dateien committen (`.pem`, `.bin`, `.img`, `.stdapp` usw.).
- Keine internen IPs, Seriennummern oder Mail-Adressen in Screenshots/GIFs.
- Keine temporären/Lock-Dateien committen.
- `git status` muss vor Push sauber und erwartbar sein.
