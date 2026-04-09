// src/data/stations.ts

export const stationData = {
  hits: {
    hits: [
      {
        _source: {
          id: "ST-001",
          name_text: "ကမ်းနားလမ်း (Strand Road) EV Station",
          address: "Strand Road, Kyauktada Township, Yangon",
          lat: 16.7695, 
          lng: 96.1585,
          plug_types: ["GB/T (DC)", "CCS2"],
          is_24_7: true,
          has_backup_power: false, // 👈 ပုံမှန် မီးလာ/မီးပျက်ရှိသည်
          port_details: { port_A: 40, port_B: 20 } 
        }
      },
      {
        _source: {
          id: "ST-002",
          name_text: "Earth EV Station (Junction Square)",
          address: "Junction Square Compound, Kamayut, Yangon",
          lat: 16.8175,
          lng: 96.1305,
          plug_types: ["GB/T (DC)"],
          is_24_7: false,
          has_backup_power: false,
          port_details: { port_A: 60, port_B: 60 }
        }
      },
      {
        _source: {
          id: "ST-003",
          name_text: "NPT Charger (Thuwunna)",
          address: "Thuwunna VIP, Thingangyun, Yangon",
          lat: 16.8150,
          lng: 96.1850,
          plug_types: ["CCS2", "Type 2 (AC)"],
          is_24_7: true,
          has_backup_power: false,
          port_details: { port_A: 120, port_B: 120 }
        }
      },
      // 👈 သခင်မြပန်းခြံ အသစ်ထပ်ထည့်သည်
      {
        _source: {
          id: "ST-004",
          name_text: "သခင်မြပန်းခြံ EV Station",
          address: "Ahlone Township, Yangon",
          lat: 16.7811,
          lng: 96.1415,
          plug_types: ["CCS2", "GB/T (DC)"],
          is_24_7: true,
          has_backup_power: true, // 👈 24 နာရီ မီးရသည် (EPC Simulator ကို ကျော်မည်)
          port_details: { port_A: 60, port_B: 60 }
        }
      }
    ]
  }
};