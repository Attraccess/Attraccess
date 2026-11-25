"""3D models of the footprints: kicad/lib/attractap.3dshapes/<footprint>.stpz (gzip-compressed STEP).

Sources: the JLCEDA/EasyEDA official library (https://easyeda.com, https://lceda.cn), fetched with
easyeda2kicad for the footprints converted from it; KiCad's packages3D library
(https://gitlab.com/kicad/libraries/kicad-packages3D, CC-BY-SA 4.0 with the design exception) for the
standard footprints. Offset (mm, y up) and rotation (degrees) place a model on its footprint as the
converter placed its VRML (EasyEDA's STEP is shifted to the VRML's box where the two differ), moved
where the footprint's origin differs from the source's (centred on the pads where both have the same
pads, else pad 1 aligned), and moved again where its pins miss the holes or its terminals the pads
(model_fit.py).
Written by collect_models.py; make_lib.py attaches the models. Do not edit by hand."""

MODELS = {
    'BUZ-SMD_4P-L8.5-W8.5-P8.50-BR': ('EasyEDA (JLCEDA) library C94599, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'CONN-TH_4P-P3.5-2601-3102': ('EasyEDA (JLCEDA) library C2765061, via easyeda2kicad', (0.0, 0.02, 0.1), (0.0, 0.0, 0.0)),
    'CP_Elec_6.3x5.4': ('KiCad packages3D, CP_Elec_6.3x5.4.step', (0, 0, 0), (0, 0, 0)),
    'CP_Elec_6.3x7.7': ('KiCad packages3D, CP_Elec_6.3x7.7.step', (0, 0, 0), (0, 0, 0)),
    'CRYSTAL-SMD_4P-L3.2-W2.5-BL': ('EasyEDA (JLCEDA) library C9006, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'CRYSTAL-SMD_4P-L3.2-W2.5-BL-2': ('EasyEDA (JLCEDA) library C255943, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'C_0402_1005Metric': ('KiCad packages3D, C_0402_1005Metric.step', (0, 0, 0), (0, 0, 0)),
    'C_0603_1608Metric': ('KiCad packages3D, C_0603_1608Metric.step', (0, 0, 0), (0, 0, 0)),
    'C_0805_2012Metric': ('KiCad packages3D, C_0805_2012Metric.step', (0, 0, 0), (0, 0, 0)),
    'C_1206_3216Metric': ('KiCad packages3D, C_1206_3216Metric.step', (0, 0, 0), (0, 0, 0)),
    'C_1808_4520Metric': ('KiCad packages3D, C_1808_4520Metric.step', (0, 0, 0), (0, 0, 0)),
    'C_2211_5728Metric_Y2': ('EasyEDA (JLCEDA) library C91599, via easyeda2kicad', (0.0, 0.0, 0.75), (0.0, 0.0, 0.0)),
    'DC-IN-TH_PJ-002A': ('EasyEDA (JLCEDA) library C3096082, via easyeda2kicad, moved -7.00, -4.31 mm onto its pads', (-3.5, 2.358, 6.5), (0.0, 0.0, 180.0)),
    'D_SMB': ('KiCad packages3D, D_SMB.step', (0, 0, 0), (0, 0, 0)),
    'F1812': ('EasyEDA (JLCEDA) library C89650, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'FPC-SMD_FH12-40S-0.5SH-55': ('EasyEDA (JLCEDA) library C202114, via easyeda2kicad, moved 0.01, -2.56 mm onto its pads', (0.01, 1.156, -0.01), (0.0, 0.0, 180.0)),
    'IND-SMD_L1.6-W0.8-1': ('EasyEDA (JLCEDA) library C91630, via easyeda2kicad', (0.0, 0.0, 0.7), (0.0, 0.0, 0.0)),
    'IND-SMD_L2.5-W2.0_CKCSA252012': ('EasyEDA (JLCEDA) library C354540, via easyeda2kicad', (0.0, 0.0, 0.03), (0.0, 0.0, 0.0)),
    'IND-SMD_L3.0-W3.0_SWPA3010S': ('EasyEDA (JLCEDA) library C45403, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'IND-SMD_L4.0-W4.0': ('EasyEDA (JLCEDA) library C98361, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'L0603': ('EasyEDA (JLCEDA) library C85833, via easyeda2kicad', (0.0, -0.02, 0.25), (0.0, 0.0, 180.0)),
    'L0805': ('EasyEDA (JLCEDA) library C21519, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'LED_SK6812MINI-E_ReverseMount_Clear': ('KiCad packages3D, LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount.step', (0, 0, 0), (0, 0, 0)),
    'LGA-12_2x2mm_P0.5mm': ('KiCad packages3D, LGA-12_2x2mm_P0.5mm.step', (0, 0, 0), (0, 0, 0)),
    'PWRM-SMD_DP9900M-5V': ('envelope after SDAPO DP9900 datasheet 4.1: 21.2 x 14.0 mm, 13.35 mm seated height, transformer block 6.15 / 7.1 mm from the ends', (0, 0, 0), (0, 0, 0)),
    'QFN-104_L10.0-W10.0-P0.35-TL-EP7.5': ('EasyEDA (JLCEDA) library C54540373, via easyeda2kicad', (0.0, 0.0, 0.02), (0.0, 0.0, 0.0)),
    'QFN-32_L4.0-W4.0-P0.40-BL-EP2.7': ('EasyEDA (JLCEDA) library C703537, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'QFN-40_L6.0-W6.0-P0.50-BL-EP': ('EasyEDA (JLCEDA) library C28925, via easyeda2kicad', (0.0, 0.0, -0.01), (0.0, 0.0, 270.0)),
    'RJ45-TH_HY931147C': ('EasyEDA (JLCEDA) library C91754, via easyeda2kicad', (-2.3, 0.0, 7.03), (0.0, 0.0, 0.0)),
    'R_0402_1005Metric': ('KiCad packages3D, R_0402_1005Metric.step', (0, 0, 0), (0, 0, 0)),
    'R_0603_1608Metric': ('KiCad packages3D, R_0603_1608Metric.step', (0, 0, 0), (0, 0, 0)),
    'R_1206_3216Metric': ('KiCad packages3D, R_1206_3216Metric.step', (0, 0, 0), (0, 0, 0)),
    'R_Array_Convex_4x0402': ('KiCad packages3D, R_Array_Convex_4x0402.step', (0, 0, 0), (0, 0, 0)),
    'SENSORS-SMD_VCNL4040M3OE': ('EasyEDA (JLCEDA) library C142526, via easyeda2kicad', (0.0, 0.0, 0.03), (0.0, 0.0, 90.0)),
    'SMA_L4.3-W2.6-LS5.2-RD': ('EasyEDA (JLCEDA) library C19077523, via easyeda2kicad', (0.0, 0.0, 1.17), (0.0, 0.0, 0.0)),
    'SOD-123F_L2.7-W1.6-LS3.8-RD': ('EasyEDA (JLCEDA) library C81598, via easyeda2kicad', (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    'SOD-123_L2.7-W1.6-LS3.7-RD-1': ('EasyEDA (JLCEDA) library C8598, via easyeda2kicad', (0.0, 0.0, 0.6), (0.0, 0.0, 0.0)),
    'SOIC-8_L5.3-W5.3-P1.27-LS8.0-BL': ('EasyEDA (JLCEDA) library C97521, via easyeda2kicad', (0.0, 0.0, 0.07), (0.0, 0.0, 0.0)),
    'SOT-23': ('KiCad packages3D, SOT-23.step', (0, 0, 0), (0, 0, 0)),
    'SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR': ('EasyEDA (JLCEDA) library C141836, via easyeda2kicad', (0.0, 0.0, 0.05), (0.0, 0.0, 180.0)),
    'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL': ('EasyEDA (JLCEDA) library C7519, via easyeda2kicad', (0.0, 0.0, 0.05), (0.0, 0.0, 270.0)),
    'SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR': ('EasyEDA (JLCEDA) library C264086, via easyeda2kicad', (0.0, 0.0, 0.05), (0.0, 0.0, 180.0)),
    'SW-SMD_4P-L5.1-W5.1-P3.70-LS6.5-TL_H1.5': ('EasyEDA (JLCEDA) library C318884, via easyeda2kicad', (0.0, 0.0, 0.05), (0.0, 0.0, 0.0)),
    'TSOT-26_L2.9-W1.6-P0.95-LS2.8-BL': ('EasyEDA (JLCEDA) library C2071056, via easyeda2kicad', (0.0, 0.0, -0.05), (0.0, 0.0, 270.0)),
    'TSSOP-16_L5.0-W4.4-P0.65-LS6.4-TL': ('EasyEDA (JLCEDA) library C477924, via easyeda2kicad', (0.0, 0.0, 0.02), (0.0, 0.0, 0.0)),
    'USB-C_SMD-TYPE-C-31-M-12_1': ('EasyEDA (JLCEDA) library C165948, via easyeda2kicad, moved 0.01, 2.22 mm onto its pads', (0.01, -2.47, 0.0), (0.0, 0.0, 180.0)),
    'VQFN-10_L2.0-W2.0-P0.45-TL': ('EasyEDA (JLCEDA) library C3662799, via easyeda2kicad', (-0.01, 0.0, 0.05), (0.0, 0.0, 0.0)),
    'WIFIM-SMD_61P-L16.6-W13.2-P0.80-ESP32-C6-MINI-1-N4': ('EasyEDA (JLCEDA) library C20627095, via easyeda2kicad', (0.0, 0.63, 0.02), (0.0, 0.0, 0.0)),
}
