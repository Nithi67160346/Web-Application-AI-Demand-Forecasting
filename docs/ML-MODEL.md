# โมเดล Machine Learning สำหรับ Demand Forecasting

เพิ่ม 2026-10-09: `ridge_lagged`, รุ่น `ridge-lag-v1`.
เป็น supervised Ridge Regression ที่เรียนรู้น้ำหนักจากข้อมูลนำเข้าของแต่ละสินค้า/พื้นที่.
Backend ใช้ scikit-learn 1.7.2, NumPy 2.2.6, SciPy 1.15.3.
Demo ใช้การฝึกแบบเดียวกันใน JavaScript โดยแก้สมการ Ridge `(XᵀX + alpha I)w = Xᵀy`.
ไม่มี weights ที่นำมาแสดงแทนการฝึก และไม่มีโมเดลร่วมข้าม Workspace.

## Features และการฝึก

- lag ยอดขายก่อนวันเป้าหมาย 1, 7, 14, 28 วัน
- ค่าเฉลี่ยยอดขายก่อนวันเป้าหมาย 7 และ 28 วัน
- วันในสัปดาห์แบบ one-hot (6 columns, Sunday เป็น reference) และลำดับวัน / 365
- Standardize features และ target โดยใช้ข้อมูลฝึกเท่านั้น; constant columns ใช้ scale 1
- Ridge มี alpha 0.1, 1 หรือ 10; เลือกจากสอง validation windows ตามเวลา
- จำกัด 730 training targets ล่าสุดต่อการ fit; ML ต้องมีประวัติอย่างน้อย 140 วันปฏิทิน

## การประเมิน

สองช่วง validation ช่วงละ 28 วันอยู่ก่อน final holdout 28 วัน.
ทุก fold สร้าง features/scalers/weights ใหม่จากข้อมูลก่อน cutoff เท่านั้น.
ML พยากรณ์แบบ recursive: วันถัดไปใช้ lag ของ prediction หากไม่มี Actual ที่รู้ ณ cutoff.
ห้ามใส่ Actual ของ validation/holdout กลับเข้า lag ระหว่างการประเมิน.
Auto เลือกโมเดลจาก Validation score = MAE + |Bias| ก่อนปัดเศษ (`selection_score`; `selection_mae` เก็บ MAE แยก)
และใช้คะแนนเดียวกันเลือก alpha. ยอดขายไม่สม่ำเสมอ (ADI ≥ 1.32 จากประวัติก่อน holdout) เพิ่ม Croston SBA; โหมด ML ผู้ใช้เลือก Ridge โดยตรงแต่ยังดูคะแนน baseline ได้.
Holdout WAPE/MAE เป็นผลรอบที่ฝึกก่อน holdout. หลังประเมินจึง fit ครั้งสุดท้ายด้วยประวัติทั้งหมด ณ origin.
พารามิเตอร์ครั้งสุดท้ายไม่ได้อ้างว่าเป็นพารามิเตอร์ที่ใช้ทดสอบ holdout.

ผล Forecast บันทึก model type/mode/version, validation windows, alpha scores และ JSON artifact.
Artifact มี coefficients/scalers, training dates/sample count, history length และยอด 28 วันล่าสุด.
`predict_saved_artifact` / `predictSavedArtifact` พยากรณ์จากไฟล์นี้โดยไม่ต้อง fit หรืออ่านไฟล์ pickle.
ชื่อ features/coefficients อธิบายโครงสร้างโมเดล; น้ำหนักไม่ใช่หลักฐานสาเหตุทางธุรกิจ.

## ข้อจำกัด

ML ไม่รับประกันว่าแม่นกว่า baseline. ข้อมูลสังเคราะห์ใช้ทดสอบการทำงาน ไม่รับรองผลกับธุรกิจจริง.
ยังไม่มีราคา โปรโมชั่น วันหยุด โรคระบาด หรือกำหนดรับสินค้าจริงเป็น features.
ค่าต่ำ–สูงใช้ empirical residual band ของ holdout; ไม่ใช่ calibrated probability interval.
ข้อมูลขาดวันใช้ศูนย์เมื่อผู้ใช้ยืนยันเท่านั้น. ควรตรวจไฟล์ที่นำเข้าก่อนใช้แผนจริง.

## แหล่งอ้างอิงและหลักฐาน

- [Ridge Regression ของ scikit-learn](https://scikit-learn.org/1.7/modules/generated/sklearn.linear_model.Ridge.html)
- [หลีกเลี่ยง data leakage](https://scikit-learn.org/stable/common_pitfalls.html)
- Python tests ตรวจเรียนรู้รูปแบบที่ไม่ใช่สัปดาห์, tamper holdout, training cap, zeros และ as-of isolation.
- Browser tests ตรวจโมเดล/parameters ที่เก็บข้าม connection และ JSON inference ไม่ต้อง fit.
- `tests/fixtures/ml-ridge-reference.json` เป็น reference จาก scikit-learn สำหรับ cycle, trend/weekday และ zero.
  ทั้ง Python และ JavaScript ต้องได้ recursive forecasts 180 วันตรง reference ภายใน 0.000001 ชิ้น.
