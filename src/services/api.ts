// src/services/api.ts

// const API_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL as string;
const API_URL = "https://script.google.com/macros/s/AKfycbyb6gl0l9NyMwvuqrF7yykKcZJytmPPh9ss7thajKhyOlGNnugM0ylz8l0uHC_j6WRF/exec"

export async function fetchSheetData(sheetName: string) {
  try {
    const response = await fetch(`${API_URL}?sheetName=${sheetName}`, {
      method: 'GET',
      // Apps Script GET request များအတွက် headers ကို ဖြုတ်ထားခြင်းက CORS error ကို ပိုကင်းစေပါတယ်
      redirect: 'follow', // 👈 ဒါလေး ထည့်ပေးရပါမယ်
      cache: 'no-store', 
    });
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

export async function appendSheetData(sheetName: string, rowData: any[]) {
  try {
    console.log("Sending POST Request to:", API_URL); // URL မှန်မမှန် စစ်ရန်
    
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ sheetName, rowData }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow' // 👈 Apps Script အတွက် အလွန်အရေးကြီးသော အချက်
    });
    
    // JSON တန်းမပြောင်းဘဲ Raw Text အရင်ယူစစ်ကြည့်မည်
    const rawText = await response.text();
    console.log("Raw Response from Google:", rawText); 

    try {
      const result = JSON.parse(rawText);
      return result;
    } catch (parseError) {
      console.error("JSON ပြောင်း၍မရပါ။ Google မှ ပြန်ပို့သောစာ:", rawText);
      return { status: 'error', message: 'Invalid server response' };
    }
  } catch (error) {
    console.error("Fetch Request Error:", error);
    return { status: 'error' };
  }
}