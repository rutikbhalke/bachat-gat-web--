"""
Script to generate multi-language voice narration (English, Hindi, Marathi)
and synchronized SRT subtitles for the Bachat Gat demonstration video.
"""

import os
import sys
import asyncio
import json
import subprocess
from pathlib import Path
import edge_tts

ROOT_DIR = Path(__file__).resolve().parent.parent
DEMO_OUTPUT_DIR = ROOT_DIR / "demo-output"
AUDIO_DIR = DEMO_OUTPUT_DIR / "audio"
SUBTITLES_DIR = DEMO_OUTPUT_DIR / "subtitles"
TEMP_AUDIO_DIR = DEMO_OUTPUT_DIR / "temp_audio"

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)
TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG_PATH = r"C:\Users\Vaibhav\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-essentials_build\bin\ffmpeg.exe"
FFPROBE_PATH = r"C:\Users\Vaibhav\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-essentials_build\bin\ffprobe.exe"

# Voice configurations: Professional Male Indian presenter voices
VOICES = {
    "en": "en-IN-PrabhatNeural",
    "hi": "hi-IN-MadhurNeural",
    "mr": "mr-IN-ManoharNeural"
}

# The 16 scene narrations covering all 32 required points
SCENES = [
    {
        "id": "scene_01",
        "title": "Admin Login & Role-Based Security",
        "en": "Welcome to the demonstration of the Bachat Gat Digital Savings Group Management System. We begin at the secure admin authentication portal. Role-based access control ensures that only authorized administrators can access group accounts, record transactions, and manage microfinance operations. Logging in redirects us seamlessly to the executive dashboard.",
        "hi": "बचत गट डिजिटल सेविंग्स ग्रुप मैनेजमेंट सिस्टम के इस डेमोंस्ट्रेशन में आपका स्वागत है। सबसे पहले हम एडमिन लॉगिन पोर्टल पर आते हैं। यहाँ रोल-बेस्ड एक्सेस कंट्रोल लागू है, जिससे केवल अधिकृत एडमिन ही ग्रुप के खाते और वित्तीय लेन-देन संभाल सकते हैं। लॉगिन करते ही हम मुख्य डैशबोर्ड पर पहुँच जाते हैं।",
        "mr": "बचत गट डिजिटल सेव्हिंग्ज ग्रुप मॅनेजमेंट सिस्टीमच्या या प्रात्यक्षिकामध्ये आपले स्वागत आहे. आपण सुरुवातीला सुरक्षित अ‍ॅडमिन लॉगिन पोर्टलवर आलो आहोत. येथे रोल-बेस्ड अ‍ॅक्सेस कंट्रोलमुळे केवळ अधिकृत अ‍ॅडमिनच गटाचे हिशोब आणि आर्थिक व्यवहार हाताळू शकतात. लॉगिन केल्यानंतर आपण थेट मुख्य डॅशबोर्डवर येतो."
    },
    {
        "id": "scene_02",
        "title": "Real-Time Dashboard & Core Accounting Equation",
        "en": "Here on the Real-Time Dashboard, administrators get a transparent overview of the group's financial standing. At the top, you can see our isolated test group badge. The fundamental accounting equation is highlighted here: Total Group Fund equals Available Cash Balance in bank plus Active Loan Outstanding. Every rupee collected in monthly savings and loan repayments is reconciled in real time.",
        "hi": "रियल-टाइम डैशबोर्ड पर हमें पूरे बचत गट की वित्तीय स्थिति का पारदर्शी विवरण मिलता है। ऊपर हमारे टेस्ट ग्रुप का बैज दिखाई दे रहा है। यहाँ बुनियादी अकाउंटिंग समीकरण प्रदर्शित है: टोटल ग्रुप फंड बराबर है उपलब्ध कैश बैलेंस जमा एक्टिव लोन आउटस्टैंडिंग। सदस्यों की बचत और लोन अदायगी का हर रुपया रियल टाइम में संतुलित रहता है।",
        "mr": "रिअल-टाईम डॅशबोर्डवर आपल्याला बचत गटाच्या संपूर्ण आर्थिक स्थितीचा पारदर्शक आढावा मिळतो. वर आपल्या टेस्ट ग्रुपचा बॅज दिसत आहे. येथे मूलभूत अकाउंटिंग समीकरण स्पष्ट दिसते: एकूण गट निधी बरोबर उपलब्ध रोख शिल्लक अधिक थकीत कर्ज येणे. मासिक बचत आणि कर्ज परताव्याचा प्रत्येक रुपया रिअल टाइममध्ये जुळवला जातो."
    },
    {
        "id": "scene_03",
        "title": "Member Management & Mutually Exclusive Partitioning",
        "en": "Next, we navigate to Member Management. A key architectural principle of our system is mutually exclusive member partitioning. Members are categorized into Active Loan Members who are repaying installments, and Non-Loan Members who contribute regular savings. The real-time search allows quick lookup of any member by name or code.",
        "hi": "अब हम मेंबर मैनेजमेंट सेक्शन पर चलते हैं। हमारे सिस्टम का मुख्य नियम है मेंबर्स का स्पष्ट विभाजन। सदस्यों को दो श्रेणियों में बांटा गया है: एक्टिव लोन मेंबर्स जो लोन की किस्त चुका रहे हैं, और नॉन-लोन मेंबर्स जो केवल नियमित बचत जमा करते हैं। सर्च बार से किसी भी सदस्य को तुरंत खोजा जा सकता है।",
        "mr": "आता आपण मेंबर मॅनेजमेंट विभागात आलो आहोत. आपल्या प्रणालीचे मुख्य वैशिष्ट्य म्हणजे सभासदांचे अचूक वर्गीकरण. सभासदांची विभागणी दोन गटांत केली आहे: कर्ज परतफेड करणारे अ‍ॅक्टिव्ह लोन मेंबर्स, आणि केवळ नियमित बचत जमा करणारे नॉन-लोन मेंबर्स. सर्च बारद्वारे कोणत्याही सभासदाची माहिती त्वरित शोधता येते."
    },
    {
        "id": "scene_04",
        "title": "Active Loan Member Workflow",
        "en": "Looking at an Active Loan Member such as Test Member 01, we observe their outstanding debt of ₹3,000. Notice that only the 'Record Loan Payment' action is enabled. Standalone 'Record Savings' is deliberately disabled because regular savings are collected together with loan installments, ensuring atomic accounting.",
        "hi": "एक्टिव लोन मेंबर जैसे टेस्ट मेंबर 01 को देखने पर उनका ₹3,000 का बकाया लोन दिखाई देता है। यहाँ केवल 'रेकॉर्ड लोन पेमेंट' का विकल्प चालू है। अलग से बचत जमा करना जानबूझकर बंद रखा गया है, ताकि बचत और लोन की किस्त एक साथ जमा हो सके।",
        "mr": "अ‍ॅक्टिव्ह लोन मेंबर टेस्ट मेंबर 01 कडे पाहिल्यास त्यांचे ₹3,000 चे थकीत कर्ज दिसते. येथे केवळ 'रेकॉर्ड लोन पेमेंट' हेच बटण उपलब्ध आहे. स्वतंत्र बचत नोंदवणे मुद्दाम बंद ठेवले आहे, कारण मासिक बचत ही कर्जाच्या हप्त्यासोबतच एकत्रित घेतली जाते."
    },
    {
        "id": "scene_05",
        "title": "Comprehensive Member 360 Profile",
        "en": "Clicking into the member's profile opens a 360-degree audit view. Here, the system maintains a complete lifetime ledger showing cumulative monthly savings, active and closed loans, and an immutable repayment transaction log for total individual transparency.",
        "hi": "मेंबर कार्ड पर क्लिक करने पर 360-डिग्री प्रोफाइल ऑडिट पेज खुलता है। यहाँ सदस्य की कुल संचित बचत, पुराने और चालू लोन, तथा सभी किस्तों का पारदर्शी इतिहास देखा जा सकता है।",
        "mr": "मेंबर कार्डवर क्लिक केल्यावर ३६०-डिग्री प्रोफाइल ऑडिट पेज उघडते. येथे सभासदाची एकूण जमा बचत, मागील व चालू कर्जे, आणि सर्व हप्त्यांच्या नोंदींचा संपूर्ण पारदर्शक इतिहास उपलब्ध असतो."
    },
    {
        "id": "scene_06",
        "title": "Non-Loan Member Workflow",
        "en": "Returning to the directory, we inspect a Non-Loan Member. Members without active debt display the green 'No Loan' badge. For these members, the standalone 'Record Savings' button is active, set to the standardized ₹1,000 monthly share contribution.",
        "hi": "वापस आकर हम नॉन-लोन मेंबर को देखते हैं। बिना लोन वाले सदस्यों पर हरा 'नो लोन' बैज दिखाई देता है। इनके लिए केवल 'रेकॉर्ड सेविंग्स' बटन उपलब्ध रहता है, जिसमें तयशुदा ₹1,000 की मासिक बचत जमा की जाती है।",
        "mr": "परत आल्यावर आपण नॉन-लोन मेंबर पाहू शकतो. ज्यांच्यावर कर्ज नाही त्यांना हिरवा 'नो लोन' बॅज दिसतो. अशा सभासदांसाठी 'रेकॉर्ड सेव्हिंग्ज' बटन उपलब्ध असते, ज्यातून ठरलेली ₹1,000 मासिक बचत जमा होते."
    },
    {
        "id": "scene_07",
        "title": "Monthly Savings Modal & Accrual vs Payment Date",
        "en": "Opening the Record Savings modal reveals an essential accounting distinction: the Scheduled Month and Year represent the accounting accrual period, while the Payment Date tracks actual cash inflow. The modal supports Cash, UPI, and Bank transfers, maintaining rock-solid UI stability with zero layout flicker.",
        "hi": "रेकॉर्ड सेविंग्स मॉडल खोलने पर एक महत्वपूर्ण अकाउंटिंग नियम दिखता है: शेड्यूल्ड महीना और साल अकाउंटिंग अवधि को दर्शाते हैं, जबकि पेमेंट डेट उस दिन को जब असल कैश जमा हुआ। यह मॉडल कैश, यूपीआई और बैंक ट्रांसफर सपोर्ट करता है, बिना किसी स्क्रीन फ्लिकर के।",
        "mr": "रेकॉर्ड सेव्हिंग्ज डायलॉग उघडल्यावर एक महत्त्वाचा नियम दिसून येतो: शेड्यूल्ड महिना आणि वर्ष हे हिशोबाचा कालावधी ठरवतात, तर पेमेंट तारीख प्रत्यक्ष पैसे जमा झाल्याचा दिवस दर्शवते. हे कॅश, यूपीआय आणि बँक ट्रान्सफरचे पर्याय देते, पूर्णपणे स्थिर इंटरफेससह."
    },
    {
        "id": "scene_08",
        "title": "Group Savings Ledger & Duplicate Prevention",
        "en": "In the Savings Ledger section, the system logs every monthly contribution. To protect data integrity, strict unique constraints prevent duplicate savings entries for the same member within the same month, eliminating accidental double-entries.",
        "hi": "सेविंग्स लेजर सेक्शन में हर महीने की बचत का ऑडिट रिकॉर्ड रहता है। डेटा की शुद्धता के लिए सिस्टम एक ही सदस्य की एक महीने में दोहरी बचत प्रविष्टि को ब्लॉक करता है, जिससे डुप्लीकेट एंट्री की कोई संभावना नहीं रहती।",
        "mr": "सेव्हिंग्ज लेजर विभागात प्रत्येक महिन्याच्या बचतीची नोंद असते. सुरक्षिततेसाठी प्रणाली एकाच सभासदाची एकाच महिन्याची दुबार बचत नोंदवण्यास प्रतिबंध करते, ज्यामुळे कोणतीही चूक होत नाही."
    },
    {
        "id": "scene_09",
        "title": "Micro-Lending Portfolio Management",
        "en": "Moving to Loans and Repayments, we see the micro-lending portfolio. Each loan card displays critical loan terms: Principal amount of ₹5,000, monthly interest rate of 2%, and a standardized 10-month installment term. Clicking 'View Details' takes us to the comprehensive schedule.",
        "hi": "लोन्स और रिपेमेंट्स पेज पर ग्रुप का संपूर्ण लोन पोर्टफोलियो दिखता है। यहाँ ₹5,000 मूलधन, 2% प्रतिमाह ब्याज दर, और 10 महीने की अवधि स्पष्ट दर्ज है। 'व्यू डिटेल्स' पर क्लिक करके हम पूरे शेड्यूल का अध्ययन कर सकते हैं।",
        "mr": "लोन्स आणि रिपेमेंट्स पानावर गटाचा संपूर्ण कर्ज पोर्टफोलिओ दिसतो. येथे ₹5,000 मुद्दल, दरमहा 2% व्याजदर, आणि 10 महिन्यांची मुदत नोंदवली आहे. 'व्ह्यू डिटेल्स' वर क्लिक करून आपण संपूर्ण परतफेड वेळापत्रक पाहू शकतो."
    },
    {
        "id": "scene_10",
        "title": "10-Month Schedule & 2% Reducing-Balance Interest",
        "en": "On the Loan Details page, the system presents an automated 10-month amortization schedule. The system uses reducing-balance interest calculated strictly at 2% on remaining principal. As principal is repaid month by month, the monthly interest charge reduces proportionally, ensuring complete fairness.",
        "hi": "लोन डिटेल्स पेज पर 10 महीने का पारदर्शी अमॉर्टाइजेशन शेड्यूल उपलब्ध है। यहाँ घटते मूलधन पर 2% ब्याज की सटीक गणना होती है। जैसे-जैसे मूलधन कम होता है, हर महीने का ब्याज भी आनुपातिक रूप से घटता जाता है।",
        "mr": "कर्ज तपशील पानावर 10 महिन्यांचे पारदर्शी अमॉर्टायझेशन वेळापत्रक दिसते. येथे कमी होणाऱ्या मुद्दलावर दरमहा 2% व्याज आकारले जाते. जशी मुद्दलाची परतफेड होते, तसतसे मासिक व्याजही आपोआप कमी होते."
    },
    {
        "id": "scene_11",
        "title": "Combined Atomic Loan Repayment Workflow",
        "en": "When recording an installment, the system performs an atomic combined repayment: Regular Savings of ₹1,000, scheduled principal repayment, and 2% monthly interest of ₹60 are combined into a single total cash collection. Partial payments and installment splits are tracked accurately without breaking the ledger.",
        "hi": "किस्त जमा करते समय सिस्टम संयुक्त अदायगी करता है: ₹1,000 नियमित बचत, तय मूलधन, और ₹60 ब्याज—ये सब मिलकर कुल कैश राशि बनाते हैं। पार्ट पेमेंट या स्प्लिट पेमेंट की स्थिति में भी लेजर का संतुलन बिल्कुल सटीक रहता है।",
        "mr": "हप्ता जमा करताना प्रणाली एकत्रित परतफेड नोंदवते: ₹1,000 नियमित बचत, ठरलेली मुद्दल, आणि ₹60 व्याज—हे सर्व मिळून एकूण रक्कम तयार होते. अर्धवट किंवा विभागून पैसे दिले तरीही हिशोबात कोणतीही तफावत येत नाही."
    },
    {
        "id": "scene_12",
        "title": "Automated Pending Dues Audit",
        "en": "Navigating to Reports, we examine the Pending Dues tab. The system automatically cross-references member rosters against monthly schedules to identify arrears in both regular savings and overdue loan installments, giving administrators immediate recovery oversight.",
        "hi": "रिपोर्ट्स में हम 'पेंडिंग ड्यूज' टैब देखते हैं। सिस्टम अपने-आप सभी सदस्यों के रिकॉर्ड की जांच करके यह बता देता है कि किसकी बचत बकाया है और किसका लोन का हफ्ता पेंडिंग है, जिससे रिकवरी में पूरी मदद मिलती है।",
        "mr": "रिपोर्ट्स विभागात आपण 'पेंडिंग ड्यूज' टॅब पाहतो. प्रणाली आपोआप तपासणी करून कोणत्या सभासदाची मासिक बचत किंवा कर्जाचा हप्ता थकीत आहे हे स्पष्ट दाखवते, ज्यामुळे वेळेवर वसुली करणे सोपे जाते."
    },
    {
        "id": "scene_13",
        "title": "Group Lending Analytics",
        "en": "Switching to the Loans Overview tab, we review macro lending analytics. Administrators can track total deployed capital, cumulative interest earnings, overall recovery velocity, and the group's active credit exposure at a glance.",
        "hi": "लोन्स ओवरव्यू टैब में ग्रुप के कर्जों का समग्र विश्लेषण मिलता है। यहाँ कुल वितरित राशि, ब्याज से हुई कुल कमाई, और रिकवरी की गति की स्पष्ट रिपोर्ट उपलब्ध है।",
        "mr": "लोन्स ओव्हरव्ह्यू टॅबमध्ये कर्जांचे एकत्रित विश्लेषण दिसते. गटाने वाटप केलेले एकूण भांडवल, व्याजातून झालेली कमाई, आणि कर्ज वसुलीची गती येथे एका दृष्टिक्षेपात पाहता येते."
    },
    {
        "id": "scene_14",
        "title": "Taaleband / Monthly Balance Strict Column Separation",
        "en": "The cornerstone of Bachat Gat auditing is the Monthly Balance Report, known traditionally as Taaleband. Our system enforces strict column separation: Regular Savings, Loan Principal Repayments, and Interest Earnings are tracked in mutually exclusive columns. No funds are ever commingled, satisfying statutory audit standards.",
        "hi": "बचत गट ऑडिट का सबसे महत्वपूर्ण हिस्सा है मासिक ताळेबंद रिपोर्ट। हमारा सिस्टम सख्त अकाउंटिंग नियम का पालन करता है: नियमित बचत, लोन मूलधन, और ब्याज—इन तीनों के अलग-अलग कॉलम होते हैं। कोई भी फंड आपस में नहीं मिलता, जो सरकारी ऑडिट नियमों के बिल्कुल अनुकूल है।",
        "mr": "बचत गट तपासणीचा मुख्य आधार म्हणजे मासिक ताळेबंद अहवाल. आपली प्रणाली काटेकोर नियमांचे पालन करते: नियमित बचत, कर्ज मुद्दल, आणि व्याज हे तीन स्वतंत्र स्तंभांमध्ये नोंदवले जातात. कोणताही निधी एकत्र मिसळत नाही, ज्यामुळे शासकीय ऑडिटच्या नियमांची पूर्तता होते."
    },
    {
        "id": "scene_15",
        "title": "Final Reconciliation & Balance Check",
        "en": "Returning to the Dashboard for final reconciliation, we verify the mathematical integrity of the entire system. Available Balance in bank plus Active Loan Receivables matches the Total Group Fund to the exact rupee. The accounts reconcile with zero discrepancies.",
        "hi": "अंत में डैशबोर्ड पर लौटकर हम पूरे सिस्टम का गणितीय मिलान करते हैं। बैंक में उपलब्ध बैलेंस और बाजार में फंसा लोन मिलकर कुल ग्रुप फंड के पाई-पाई का हिसाब देते हैं। इसमें शून्य अंतर की गारंटी है।",
        "mr": "शेवटी डॅशबोर्डवर परत येऊन आपण संपूर्ण हिशोबाचा ताळेबंद पडताळून पाहतो. बँकेतील शिल्लक आणि येणे बाकी कर्ज मिळून एकूण गट निधीची तंतोतंत जुळणी होते. यामध्ये एका पैशाचाही फरक राहत नाही."
    },
    {
        "id": "scene_16",
        "title": "Project Summary & Conclusion",
        "en": "In conclusion, the Bachat Gat Digital Savings Group Management System delivers a robust, secure, and production-ready microfinance platform. It automates dual member partitioning, 10-month amortized lending, atomic repayments, and Taaleband reconciliation. Thank you.",
        "hi": "निष्कर्ष रूप में, यह बचत गट मैनेजमेंट सिस्टम एक मजबूत, सुरक्षित और संपूर्ण माइक्रोफाइनेंस प्लेटफॉर्म है। यह दोहरे सदस्य विभाजन, 10 महीने के अमॉर्टाइज्ड लोन, और ताळेबंद समाधान को पूरी तरह स्वचालित करता है। धन्यवाद।",
        "mr": "थोडक्यात सांगायचे तर, ही बचत गट डिजिटल व्यवस्थापन प्रणाली एक मजबूत, सुरक्षित आणि परिपूर्ण मायक्रो फायनान्स प्लॅटफॉर्म आहे. हे सभासद वर्गीकरण, १० महिन्यांचे कर्ज वाटप, आणि मासिक ताळेबंद पूर्णपणे स्वयंचलित करते. धन्यवाद."
    }
]

def get_audio_duration(file_path):
    cmd = [
        FFPROBE_PATH,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())

async def generate_scene_audio(text, voice, output_path):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))

async def main():
    print("=== Generating Scene Audios for English, Hindi, Marathi ===")
    results = {"en": [], "hi": [], "mr": []}
    
    for idx, scene in enumerate(SCENES):
        scene_id = scene["id"]
        print(f"[{idx+1}/{len(SCENES)}] Processing {scene_id}: {scene['title']}")
        
        for lang in ["en", "hi", "mr"]:
            voice = VOICES[lang]
            text = scene[lang]
            out_file = TEMP_AUDIO_DIR / f"{scene_id}_{lang}.mp3"
            await generate_scene_audio(text, voice, out_file)
            dur = get_audio_duration(out_file)
            results[lang].append({
                "scene_id": scene_id,
                "title": scene["title"],
                "text": text,
                "file": str(out_file),
                "duration": dur
            })
            print(f"   {lang.upper()} ({voice}): {dur:.2f}s")
            
    summary_path = TEMP_AUDIO_DIR / "audio_durations.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nDurations saved to {summary_path}")

if __name__ == "__main__":
    asyncio.run(main())
