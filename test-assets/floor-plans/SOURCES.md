# Test floor plans

Manual-test fixtures for the upload pipeline. All from Wikimedia Commons (public domain or freely licensed — see each file page for the exact license). All under the app's 10 MB limit.

| File | What it tests | Source |
| --- | --- | --- |
| `house-hills-decaro-1st-1906.jpg` (1.4 MB) | Clean modern redrawn plan, labeled rooms, north arrow, scale bar — the happy path | [Commons](https://commons.wikimedia.org/wiki/File:Hills-Decaro_House_First_Floor_Plan_1906.jpg) |
| `house-gottlieb-ground.pdf` (0.9 MB) | PDF input path; architect's sketch with labeled rooms | [Commons](https://commons.wikimedia.org/wiki/File:Gottlieb_House_Ground_Floor_Plan.pdf) |
| `house-bolduc.png` (1.2 MB) | Hand-lettered HABS measured drawing, dense dimension lines | [Commons](https://commons.wikimedia.org/wiki/File:Bolduc_House_Floor_Plan--Ste_Genevieve_MO.png) |
| `office-dime-building-1st.png` (0.4 MB) | Printed office/bank building plan, hatched walls | [Commons](https://commons.wikimedia.org/wiki/File:Dime_Building_1st_floor_plan.png) |
| `hotel-knickerbocker-1906.png` (0.15 MB) | Dense small-room hotel floor; many similar rooms | [Commons](https://commons.wikimedia.org/wiki/File:Hotel_Knickerbocker_1906_floor_plan_d.png) |
| `school-skyline-high.png` (0.14 MB) | Modern wayfinding-style school map; campus scale — should trip the "floor too large" validator | [Commons](https://commons.wikimedia.org/wiki/File:Skyline_High_School_Floor_Map.png) |
| `school-ground-floor-printed.png` (0.18 MB) | Very low resolution input (362 × 395 px) | [Commons](https://commons.wikimedia.org/wiki/File:Plan_of_the_high_school_building,_ground_floor.png) |
| `museum-british-1915-large.jpg` (3.2 MB) | Adversarial: sideways phone photo of a book page (rotation, page curvature, background clutter) | [Commons](https://commons.wikimedia.org/wiki/File:Map_of_Ground_Floor,_%22British_Museum,%22_London,_1915.jpg) |
