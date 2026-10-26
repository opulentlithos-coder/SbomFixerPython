NOTE: this package contains compiled code only and needs exactly Python 3.14 (not older, not newer).

SBOM FIXER DASHBOARD
====================

Upload an SBOM, get a fixed SBOM and a dashboard that shows what was
wrong and what was changed. It runs on your own computer and works
without internet.


WHAT YOU NEED
-------------
- Python 3.11 or newer (install it once from python.org; on Windows tick
  "Add python.exe to PATH").
- Nothing else. All libraries are already inside the vendor folder as plain .py files
  (no compiled .pyd/.so/.dll files), so it also runs on locked-down bank computers
  where security software blocks compiled files ("DLL load failed ... Access is denied").
  No pip and no internet are needed. The wheelhouse folder is only a fallback.


HOW TO START
------------
Windows : double-click  start.bat
Mac/Linux: open a terminal in this folder and run   sh start.sh

Your browser opens at  http://127.0.0.1:8765
(if that port is busy, the next free port is used; the address is
printed in the window).

The first start installs the libraries from the wheelhouse folder. This
takes a few seconds and needs no internet. After that it starts at once.

Keep the black window open while you use the dashboard. Close it (or
press Ctrl+C) to stop.


HOW TO USE
----------
1. Drop your SBOM file on the upload box (or click it to choose a file).
   CycloneDX 1.2 - 1.7 or SPDX 2.2 / 2.3, in JSON format.
   You can choose MANY files at once, or a .zip that holds them. Every SBOM is fixed and analysed on its
   own. You get a table with one row per SBOM (open a row for its full dashboard) and one .zip with a
   folder per SBOM (fixed SBOM, tech notes, what to fix, report) plus batch-summary.csv.
2. Wait a second. The dashboard shows:
   - the result (fixed or not) and download buttons
   - mistakes found, repairs made, layout changes, components
   - readiness score before and after
   - the list of mistakes and how to fix each one at the source
   - changes by rule, with charts
   - the NTIA minimum elements, before and after
   - how many components Checkmarx can scan, ecosystems, licences
   - a dependency map (pick a component by name in the list, or click a dot; drag the dots, scroll to zoom)
   - tables with every change and every component, the fixed SBOM,
     the tech notes and the suggestions
3. Download what you need:
   - Fixed SBOM       -> upload THIS to Checkmarx, not the original
   - Tech notes       -> what was changed (.txt)
   - What to fix      -> what to correct in your SBOM generator (.txt)
   - Report (JSON)    -> all numbers of the dashboard
   - Download all     -> everything in one .zip

No SBOM at hand? Click one of the samples on the page.

If the SBOM comes from a tool that Checkmarx cannot guess the ecosystem
of, choose the ecosystem in the "Ecosystem" list before you upload.


OPTIONS
-------
   start.bat --port 9000       use another port
   start.bat --no-browser      do not open the browser
   start.bat --host 0.0.0.0    let other computers in your network open it
                               (default: only this computer)


MOVING IT TO ANOTHER COMPUTER
-----------------------------
Copy this whole folder (USB stick, zip, network share). Then start it as
above. Nothing is installed on the computer outside this folder.
You may delete the "libs" folder before copying; it is created again.

The wheelhouse folder holds the libraries for Windows, Linux and macOS
(Intel and Apple) with Python 3.11, 3.12, 3.13 and 3.14. To refresh it
(needs internet, only if you want newer libraries):
   python tools/build_wheelhouse.py


PRIVACY
-------
Your SBOM is read by the program on this computer only. The page loads
no fonts, scripts or images from the internet. Results are kept in
memory only and are gone when you close the window.


WHAT IS IN THE FOLDER
---------------------
   start.bat / start.sh   start the dashboard
   app.py                 the small local web server
   analyzer.py            runs the fixer and prepares the numbers
   sbom_fixer/            the fixer engine (same as the command line tool)
   web/                   the dashboard page (HTML, CSS, JavaScript)
   samples/               example SBOMs
   wheelhouse/            libraries for the offline install
   requirements.txt       list of libraries
   tools/                 helper to refill the wheelhouse


IF SOMETHING GOES WRONG
-----------------------
"Python was not found"       Install Python 3.11+ and start again.
"Could not install the       Run   python -m ensurepip   and start again.
 libraries"
Page does not open           Open the address printed in the window by hand.
"The file is not valid       The file is not JSON. XML and SPDX tag-value
 JSON"                       files are not supported; make the generator
                             write JSON.


WHAT STAYS IN THE FIXED SBOM
----------------------------
Each component keeps bom-ref, type, name, version, purl and licenses. Supplier, author(s), publisher and
description are kept only when your original SBOM has them; nothing is added when it does not. For an SPDX
file the supplier, originator (author) and description are carried over in the CycloneDX form of the schema.
