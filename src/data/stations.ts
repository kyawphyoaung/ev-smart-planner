// src/data/stations.ts အား ဤကုဒ်ဖြင့် အစားထိုးပါ
export const stationData = {
  hits: {
    hits: [
      {
        _id: "1695112125155x661458112083656700",
        _source: {
          id: "1695112125155x661458112083656700",
          name_text: "Essential Motors (ရန်ကုန်ဘူတာကြီး Station)",
          location_name_text: "Yangon",
          address_text: "Kun Chan Rd, Yangon Railway Station",
          lat_number: 16.782402335983,
          long_number: 96.162105012116,
          phone_number_text: "09799695331",
          opening_hours_text: "6:00 AM TO 11:00 PM",
          station__ac_dc__option_ac_dc_station: "dc",
          list_of_plugs_types_list_option_plug_types: ["dc_gb_t", "dc_ccs2"],
          price_text: "750",
          always_open__yes_no__boolean: false,
          has_backup_power: false,
          port_details: { port_A: 60, port_B: 60 },
          photos_list_image: [
            "https://86036ea01f8eea5aa507ec09fb0e586a.cdn.bubble.io/f1701566217323x454535211114205400/IMG_20231202_113301.jpg"
          ],
          // 👇 ဘူတာကြီး Station သည် နားချိန်မရှိပါ
          has_break_time: false 
        }
      },
      {
        _id: "1700891204657x979318291489095700",
        _source: {
          id: "1700891204657x979318291489095700",
          name_text: "CDS (သခင်မြပန်းခြံ Station)",
          location_name_text: "Ahlone",
          address_text: "Thakhinmya Park , Alone",
          lat_number: 16.7800471876258,
          long_number: 96.1362934307058,
          phone_number_text: "09427881436",
          opening_hours_text: "7:00AM TO 7:30PM",
          station__ac_dc__option_ac_dc_station: "dc",
          list_of_plugs_types_list_option_plug_types: ["dc_ccs2", "dc_gb_t"],
          price_text: "750",
          always_open__yes_no__boolean: false,
          has_backup_power: true, 
          port_details: { port_A: 60, port_B: 60 },
          photos_list_image: [
            "https://86036ea01f8eea5aa507ec09fb0e586a.cdn.bubble.io/f1701173262609x560024514470385300/IMG_20231128_183613.jpg"
          ],
          // 👇 သခင်မြပန်းခြံသည် ၁၂ နာရီမှ ၁ နာရီ နားပါသည် (12 to 13)
          has_break_time: true,
          break_start_hr: 12,
          break_end_hr: 13,
          break_time_text: "12:00 PM မှ 1:00 PM"
        }
      },
      {
        _id: "1700891204657x979318291489095701",
        _source: {
          id: "1700891204657x979318291489095701",
          name_text: "Essential Motors(ကမ်းနားလမ်း Station)",
          location_name_text: "Latha",
          address_text: "Strand Road, Latha",
          lat_number: 16.771924,
          long_number: 96.151842,
          phone_number_text: "09770173409",
          opening_hours_text: "6:00AM TO 11:00PM",
          station__ac_dc__option_ac_dc_station: "dc",
          list_of_plugs_types_list_option_plug_types: ["dc_ccs2", "dc_gb_t"],
          price_text: "750",
          always_open__yes_no__boolean: false,
          has_backup_power: false, 
          port_details: { port_A: 40, port_B: 20 },
          photos_list_image: [
            "https://lh3.googleusercontent.com/gps-cs-s/APNQkAEesGFYEnQQoJP-cLzmk29nI3hD2XiMLjEtwctrn22bgaEDrWfon1JeeTBDqNuYngKpoSeowBRcN2EaMk1ViQ2U85VoDVDdHN7ku6nzYC_vka377SxTTKOgkUmjwdWPSDhW8k8HlqQ_Uw4=s1030-k-no"
          ],
          has_break_time: true,
          break_start_hr: 14,
          break_end_hr: 15,
          break_time_text: "2:00 PM မှ 3:00 PM"
        }
      }
    ]
  }
};