// src/lib/epcSchedule.ts

export type EPCStatus = 'POWER_ON' | 'POWER_OFF';

/**
 * လက်ရှိအချိန်နှင့် လက်ရှိမီးအခြေအနေကို ထည့်သွင်းပါက 
 * နောက်ထပ် မီးအခြေအနေ ပြောင်းလဲမည့် (မီးလာ/မီးပျက်မည့်) အချိန်ကို ပြန်ထုတ်ပေးပါမည်။
 */
export function getNextEPCStatusChange(currentTime: Date, currentStatus: EPCStatus): Date {
  const currentHour = currentTime.getHours();
  let nextChangeTime = new Date(currentTime);
  let endHour = 0;

  // အပိုင်း ၆ ပိုင်းအရ လက်ရှိအချိန် ပါဝင်နေသည့် အပိုင်း၏ End Time ကို ရှာဖွေခြင်း
  if (currentHour >= 1 && currentHour < 5) {
    endHour = 5; // 01:00 AM - 05:00 AM
  } else if (currentHour >= 5 && currentHour < 9) {
    endHour = 9; // 05:00 AM - 09:00 AM
  } else if (currentHour >= 9 && currentHour < 13) {
    endHour = 13; // 09:00 AM - 01:00 PM
  } else if (currentHour >= 13 && currentHour < 17) {
    endHour = 17; // 01:00 PM - 05:00 PM
  } else if (currentHour >= 17 && currentHour < 21) {
    endHour = 21; // 05:00 PM - 09:00 PM
  } else {
    // 09:00 PM မှ 01:00 AM (ညသန်းခေါင်ကျော်)
    endHour = 1;
    // ည ၉ နာရီကျော်နေပါက နောက်တစ်နေ့ (Next Day) ၏ မနက် ၁ နာရီသို့ ပြောင်းပေးရန်
    if (currentHour >= 21) {
      nextChangeTime.setDate(nextChangeTime.getDate() + 1);
    }
  }

  // ခန့်မှန်းထားသော End Time ကို သတ်မှတ်ခြင်း (မိနစ်နှင့် စက္ကန့်ကို ၀ သတ်မှတ်သည်)
  nextChangeTime.setHours(endHour, 0, 0, 0);

  // မှတ်ချက်- 
  // User က 'POWER_OFF' (မီးပျက်နေသည်) ဟု ရွေးထားပါက nextChangeTime သည် 'မီးပြန်လာမည့်အချိန်' ဖြစ်သည်။
  // User က 'POWER_ON' (မီးလာနေသည်) ဟု ရွေးထားပါက nextChangeTime သည် 'မီးပြန်ပျက်မည့်အချိန်' ဖြစ်သည်။

  return nextChangeTime;
}