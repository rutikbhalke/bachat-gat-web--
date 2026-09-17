"""
Master Build Script for Bachat Gat Multi-Language Demo Video Package.
Generates:
1. Multilingual Audio Tracks:
   - English (en-IN-PrabhatNeural) -> demo-output/audio/english.mp3
   - Hindi   (hi-IN-MadhurNeural)   -> demo-output/audio/hindi.mp3
   - Marathi (mr-IN-ManoharNeural)  -> demo-output/audio/marathi.mp3
2. Synchronized Subtitles:
   - English -> demo-output/subtitles/english.srt
   - Hindi   -> demo-output/subtitles/hindi.srt
   - Marathi -> demo-output/subtitles/marathi.srt
3. Master MKV Container:
   - demo-output/Bachat-Gat-Digital-Savings-Group-Final-Multilingual.mkv
   - Video: 1080p H.264
   - Audio 1: English
   - Audio 2: Hindi
   - Audio 3: Marathi
   - Subtitle 1: English
   - Subtitle 2: Hindi
   - Subtitle 3: Marathi
4. Presentation MP4:
   - demo-output/Bachat-Gat-Digital-Savings-Group-Final.mp4
   - Video: 1080p H.264
   - Audio: English AAC
   - Subtitles: mov_text soft subtitles
"""

import os
import sys
import json
import asyncio
import subprocess
from pathlib import Path

# Fix Windows cp1252 terminal printing for emojis and Indic scripts
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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

SOURCE_VIDEO = DEMO_OUTPUT_DIR / "bachat-gat-demo.webm"
TOTAL_VIDEO_DURATION = 354.60

VOICES = {
    "en": {"voice": "en-IN-PrabhatNeural", "title": "English"},
    "hi": {"voice": "hi-IN-MadhurNeural", "title": "Hindi"},
    "mr": {"voice": "mr-IN-ManoharNeural", "title": "Marathi"}
}

SCENES = [
    {
        "id": "scene_01",
        "start": 3.0,
        "max_window": 24.5,
        "title": "Admin Login & Role-Based Security",
        "en": {
            "rate": "+12%",
            "text": "Welcome to the demonstration of the Bachat Gat Digital Savings Group Management System. We begin at the secure admin authentication portal. Role-based access control ensures that only authorized administrators can access group accounts, record transactions, and manage microfinance operations."
        },
        "hi": {
            "rate": "+8%",
            "text": "बचत गट डिजिटल सेविंग्स ग्रुप मैनेजमेंट सिस्टम के इस डेमोंस्ट्रेशन में आपका स्वागत है। सबसे पहले हम एडमिन लॉगिन पोर्टल पर आते हैं। यहाँ रोल-बेस्ड एक्सेस कंट्रोल लागू है, जिससे केवल अधिकृत एडमिन ही ग्रुप के खाते और वित्तीय लेन-देन संभाल सकते हैं।"
        },
        "mr": {
            "rate": "+8%",
            "text": "बचत गट डिजिटल सेव्हिंग्ज ग्रुप मॅनेजमेंट सिस्टीमच्या या प्रात्यक्षिकामध्ये आपले स्वागत आहे. आपण सुरुवातीला सुरक्षित अ‍ॅडमिन लॉगिन पोर्टलवर आलो आहोत. येथे रोल-बेस्ड अ‍ॅक्सेस कंट्रोलमुळे केवळ अधिकृत अ‍ॅडमिनच गटाचे हिशोब आणि आर्थिक व्यवहार हाताळू शकतात."
        }
    },
    {
        "id": "scene_02",
        "start": 28.0,
        "max_window": 34.0,
        "title": "Real-Time Dashboard & Core Accounting Equation",
        "en": {
            "rate": "+10%",
            "text": "Here on the Real-Time Dashboard, administrators get a transparent overview of the group's financial standing. At the top, you can see our isolated test group badge. The fundamental accounting equation is highlighted here: Total Group Fund equals Available Cash Balance in bank plus Active Loan Outstanding. Every rupee collected is reconciled in real time."
        },
        "hi": {
            "rate": "+6%",
            "text": "रियल-टाइम डैशबोर्ड पर हमें पूरे बचत गट की वित्तीय स्थिति का पारदर्शी विवरण मिलता है। ऊपर हमारे टेस्ट ग्रुप का बैज दिखाई दे रहा है। यहाँ बुनियादी अकाउंटिंग समीकरण प्रदर्शित है: टोटल ग्रुप फंड बराबर है उपलब्ध कैश बैलेंस जमा एक्टिव लोन आउटस्टैंडिंग। सदस्यों की बचत और लोन अदायगी का हर रुपया रियल टाइम में संतुलित रहता है।"
        },
        "mr": {
            "rate": "+6%",
            "text": "रिअल-टाईम डॅशबोर्डवर आपल्याला बचत गटाच्या संपूर्ण आर्थिक स्थितीचा पारदर्शक आढावा मिळतो. वर आपल्या टेस्ट ग्रुपचा बॅज दिसत आहे. येथे मूलभूत अकाउंटिंग समीकरण स्पष्ट दिसते: एकूण गट निधी बरोबर उपलब्ध रोख शिल्लक अधिक थकीत कर्ज येणे. मासिक बचत आणि कर्ज परताव्याचा प्रत्येक रुपया रिअल टाइममध्ये जुळवला जातो."
        }
    },
    {
        "id": "scene_03",
        "start": 63.0,
        "max_window": 24.0,
        "title": "Member Management & Mutually Exclusive Partitioning",
        "en": {
            "rate": "+12%",
            "text": "Next, we navigate to Member Management. A key architectural principle of our system is mutually exclusive member partitioning. Members are categorized into Active Loan Members who are repaying installments, and Non-Loan Members who contribute regular savings. The real-time search allows quick lookup of any member."
        },
        "hi": {
            "rate": "+14%",
            "text": "अब हम मेंबर मैनेजमेंट सेक्शन पर चलते हैं। हमारे सिस्टम का मुख्य नियम है मेंबर्स का स्पष्ट विभाजन। सदस्यों को दो श्रेणियों में बांटा गया है: एक्टिव लोन मेंबर्स जो लोन की किस्त चुका रहे हैं, और नॉन-लोन मेंबर्स जो केवल नियमित बचत जमा करते हैं। सर्च बार से किसी भी सदस्य को तुरंत खोजा जा सकता है।"
        },
        "mr": {
            "rate": "+8%",
            "text": "आता आपण मेंबर मॅनेजमेंट विभागात आलो आहोत. आपल्या प्रणालीचे मुख्य वैशिष्ट्य म्हणजे सभासदांचे अचूक वर्गीकरण. सभासदांची विभागणी दोन गटांत केली आहे: कर्ज परतफेड करणारे अ‍ॅक्टिव्ह लोन मेंबर्स, आणि केवळ नियमित बचत जमा करणारे नॉन-लोन मेंबर्स. सर्च बारद्वारे सभासदांची माहिती त्वरित शोधता येते."
        }
    },
    {
        "id": "scene_04",
        "start": 87.0,
        "max_window": 17.0,
        "title": "Active Loan Member Workflow",
        "en": {
            "rate": "+15%",
            "text": "For an Active Loan Member with an active ₹5,000 loan, only 'Record Loan Payment' is enabled. Standalone savings is disabled because savings are collected with loan installments, ensuring atomic accounting."
        },
        "hi": {
            "rate": "+12%",
            "text": "एक्टिव लोन मेंबर का ₹5,000 का एक्टिव लोन दिखाई दे रहा है। यहाँ केवल 'रेकॉर्ड लोन पेमेंट' विकल्प चालू है। अलग से बचत जमा करना बंद है, क्योंकि बचत और लोन किस्त एक साथ जमा होती है।"
        },
        "mr": {
            "rate": "+12%",
            "text": "अ‍ॅक्टिव्ह लोन मेंबरचे ₹5,000 चे सक्रिय कर्ज दिसते. येथे केवळ 'रेकॉर्ड लोन पेमेंट' चालू आहे. स्वतंत्र बचत बंद ठेवली आहे, कारण बचत ही कर्जाच्या हप्त्यासोबतच जमा होते."
        }
    },
    {
        "id": "scene_05",
        "start": 105.0,
        "max_window": 19.0,
        "title": "Comprehensive Member 360 Profile",
        "en": {
            "rate": "+12%",
            "text": "Clicking into the member's profile opens a 360-degree audit view. Here, the system maintains a complete lifetime ledger showing cumulative monthly savings, active and closed loans, and an immutable repayment transaction log for total individual transparency."
        },
        "hi": {
            "rate": "+8%",
            "text": "मेंबर कार्ड पर क्लिक करने पर 360-डिग्री प्रोफाइल ऑडिट पेज खुलता है। यहाँ सदस्य की कुल संचित बचत, पुराने और चालू लोन, तथा सभी किस्तों का पारदर्शी इतिहास देखा जा सकता है।"
        },
        "mr": {
            "rate": "+8%",
            "text": "मेंबर कार्डवर क्लिक केल्यावर ३६०-डिग्री प्रोफाइल ऑडिट पेज उघडते. येथे सभासदाची एकूण जमा बचत, मागील व चालू कर्जे, आणि सर्व हप्त्यांच्या नोंदींचा संपूर्ण पारदर्शक इतिहास उपलब्ध असतो."
        }
    },
    {
        "id": "scene_06",
        "start": 125.0,
        "max_window": 17.0,
        "title": "Non-Loan Member Workflow",
        "en": {
            "rate": "+20%",
            "text": "Returning to the directory, we inspect a Non-Loan Member. Members without active debt display the green 'No Loan' badge. For these members, the standalone 'Record Savings' button is active, set to the standardized ₹1,000 monthly share."
        },
        "hi": {
            "rate": "+16%",
            "text": "वापस आकर हम नॉन-लोन मेंबर को देखते हैं। बिना लोन वाले सदस्यों पर हरा 'नो लोन' बैज है। इनके लिए 'रेकॉर्ड सेविंग्स' बटन उपलब्ध है, जिसमें ₹1,000 की मासिक बचत जमा की जाती है।"
        },
        "mr": {
            "rate": "+10%",
            "text": "परत आल्यावर आपण नॉन-लोन मेंबर पाहतो. ज्यांच्यावर कर्ज नाही त्यांना हिरवा 'नो लोन' बॅज दिसतो. अशा सभासदांसाठी 'रेकॉर्ड सेव्हिंग्ज' बटन उपलब्ध असते, ज्यातून ₹1,000 मासिक बचत जमा होते."
        }
    },
    {
        "id": "scene_07",
        "start": 143.0,
        "max_window": 23.0,
        "title": "Monthly Savings Modal & Accrual vs Payment Date",
        "en": {
            "rate": "+12%",
            "text": "Opening the Record Savings modal reveals an essential accounting distinction: the Scheduled Month and Year represent the accounting accrual period, while the Payment Date tracks actual cash inflow. The modal supports Cash, UPI, and Bank transfers, maintaining complete UI stability."
        },
        "hi": {
            "rate": "+8%",
            "text": "रेकॉर्ड सेविंग्स मॉडल खोलने पर एक महत्वपूर्ण नियम दिखता है: शेड्यूल्ड महीना और साल अकाउंटिंग अवधि को दर्शाते हैं, जबकि पेमेंट डेट असल कैश जमा होने का दिन। यह मॉडल कैश, यूपीआई और बैंक ट्रांसफर सपोर्ट करता है, बिना किसी स्क्रीन फ्लिकर के।"
        },
        "mr": {
            "rate": "+8%",
            "text": "रेकॉर्ड सेव्हिंग्ज डायलॉग उघडल्यावर एक महत्त्वाचा नियम दिसून येतो: शेड्यूल्ड महिना आणि वर्ष हे हिशोबाचा कालावधी ठरवतात, तर पेमेंट तारीख प्रत्यक्ष पैसे जमा झाल्याचा दिवस दर्शवते. हे कॅश, यूपीआय आणि बँक ट्रान्सफर पर्याय स्थिरतेसह देते."
        }
    },
    {
        "id": "scene_08",
        "start": 167.0,
        "max_window": 20.0,
        "title": "Group Savings Ledger & Duplicate Prevention",
        "en": {
            "rate": "+12%",
            "text": "In the Savings Ledger section, the system logs every monthly contribution. To protect data integrity, strict unique constraints prevent duplicate savings entries for the same member within the same month, eliminating accidental double-entries."
        },
        "hi": {
            "rate": "+8%",
            "text": "सेविंग्स लेजर सेक्शन में हर महीने की बचत का ऑडिट रिकॉर्ड रहता है। डेटा की शुद्धता के लिए सिस्टम एक ही सदस्य की एक महीने में दोहरी बचत प्रविष्टि को ब्लॉक करता है, जिससे डुप्लीकेट एंट्री नहीं हो सकती।"
        },
        "mr": {
            "rate": "+8%",
            "text": "सेव्हिंग्ज लेजर विभागात प्रत्येक महिन्याच्या बचतीची नोंद असते. सुरक्षिततेसाठी प्रणाली एकाच सभासदाची एकाच महिन्याची दुबार बचत नोंदवण्यास प्रतिबंध करते, ज्यामुळे कोणतीही चूक होत नाही."
        }
    },
    {
        "id": "scene_09",
        "start": 188.0,
        "max_window": 17.0,
        "title": "Micro-Lending Portfolio Management",
        "en": {
            "rate": "+15%",
            "text": "Moving to Loans and Repayments, we see the micro-lending portfolio. Each loan card displays key terms: Principal of ₹5,000, 2% monthly interest, and a 10-month installment term. Clicking 'View Details' opens the comprehensive schedule."
        },
        "hi": {
            "rate": "+16%",
            "text": "लोन्स और रिपेमेंट्स पेज पर संपूर्ण लोन पोर्टफोलियो दिखता है। यहाँ ₹5,000 मूलधन, 2% प्रतिमाह ब्याज दर, और 10 महीने की अवधि दर्ज है। 'व्यू डिटेल्स' पर क्लिक करके हम पूरे शेड्यूल का अध्ययन करते हैं।"
        },
        "mr": {
            "rate": "+10%",
            "text": "लोन्स आणि रिपेमेंट्स पानावर संपूर्ण कर्ज पोर्टफोलिओ दिसतो. येथे ₹5,000 मुद्दल, दरमहा 2% व्याजदर, आणि 10 महिन्यांची मुदत नोंदवली आहे. 'व्ह्यू डिटेल्स' वर क्लिक करून आपण संपूर्ण वेळापत्रक पाहतो."
        }
    },
    {
        "id": "scene_10",
        "start": 206.0,
        "max_window": 21.0,
        "title": "10-Month Schedule & 2% Reducing-Balance Interest",
        "en": {
            "rate": "+12%",
            "text": "On the Loan Details page, the system presents an automated 10-month amortization schedule. The system uses reducing-balance interest calculated strictly at 2% on remaining principal. As principal is repaid, the monthly interest charge reduces proportionally."
        },
        "hi": {
            "rate": "+8%",
            "text": "लोन डिटेल्स पेज पर 10 महीने का पारदर्शी अमॉर्टाइजेशन शेड्यूल उपलब्ध है। यहाँ घटते मूलधन पर 2% ब्याज की सटीक गणना होती है। जैसे-जैसे मूलधन कम होता है, हर महीने का ब्याज भी घटता जाता है।"
        },
        "mr": {
            "rate": "+8%",
            "text": "कर्ज तपशील पानावर 10 महिन्यांचे पारदर्शी अमॉर्टायझेशन वेळापत्रक दिसते. येथे कमी होणाऱ्या मुद्दलावर दरमहा 2% व्याज आकारले जाते. मुद्दलाची परतफेड होताच मासिक व्याजही आपोआप कमी होते."
        }
    },
    {
        "id": "scene_11",
        "start": 228.0,
        "max_window": 37.0,
        "title": "Live Combined Loan Repayment Execution",
        "en": {
            "rate": "+14%",
            "text": "We execute a live repayment for Installment Number One: ₹500 principal plus ₹100 reducing interest at 2%, totaling ₹600 cash. Upon submission, outstanding principal immediately updates from ₹5,000 to ₹4,500, reflected across the loan ledger."
        },
        "hi": {
            "rate": "+10%",
            "text": "हम पहली किस्त का वास्तविक भुगतान दर्ज करते हैं: ₹500 मूलधन और 2% की दर से ₹100 ब्याज, यानी कुल ₹600 कैश। सबमिट करते ही लोन आउटस्टैंडिंग ₹5,000 से घटकर ₹4,500 हो जाता है, और लेजर में पूरी प्रविष्टि तुरंत अपडेट हो जाती है।"
        },
        "mr": {
            "rate": "+10%",
            "text": "आता आपण पहिल्या हप्त्याची प्रत्यक्ष परतफेड नोंदवत आहोत: ₹500 मुद्दल आणि 2% दराने ₹100 व्याज, एकूण ₹600 रोख. सबमिट करताच थकीत कर्ज ₹5,000 वरून ₹4,500 वर येते आणि कर्ज नोंदवहीत त्याची अचूक नोंद होते."
        }
    },
    {
        "id": "scene_12",
        "start": 267.0,
        "max_window": 18.0,
        "title": "Automated Pending Dues Audit — September 2026",
        "en": {
            "rate": "+12%",
            "text": "Navigating to Reports, we examine the Pending Dues tab. For September 2026, the loan issue month has zero installments due, and all member savings are fully paid, displaying exact zero pending arrears."
        },
        "hi": {
            "rate": "+8%",
            "text": "रिपोर्ट्स में हम 'पेंडिंग ड्यूज' टैब देखते हैं। सितंबर 2026 में लोन जारी होने के कारण कोई किस्त देय नहीं है, और सभी सदस्यों की बचत पूर्ण होने से कुल पेंडिंग बकाया बिल्कुल शून्य दिखाई देता है।"
        },
        "mr": {
            "rate": "+8%",
            "text": "रिपोर्ट्स विभागात आपण 'पेंडिंग ड्यूज' टॅब पाहतो. सप्टेंबर 2026 हा कर्ज वितरणाचा महिना असल्याने कोणताही हप्ता देय नाही, आणि सर्व सभासदांची बचत पूर्ण असल्याने थकीत रक्कम तंतोतंत शून्य दिसते."
        }
    },
    {
        "id": "scene_13",
        "start": 286.0,
        "max_window": 18.0,
        "title": "Group Lending Analytics",
        "en": {
            "rate": "+12%",
            "text": "Switching to the Loans Overview tab, we review macro lending analytics. Administrators can track total deployed capital, cumulative interest earnings, overall recovery velocity, and the group's active credit exposure at a glance."
        },
        "hi": {
            "rate": "+8%",
            "text": "लोन्स ओवरव्यू टैब में ग्रुप के कर्जों का समग्र विश्लेषण मिलता है। यहाँ कुल वितरित राशि, ब्याज से हुई कुल कमाई, और रिकवरी की गति की स्पष्ट रिपोर्ट उपलब्ध है।"
        },
        "mr": {
            "rate": "+8%",
            "text": "लोन्स ओव्हरव्ह्यू टॅबमध्ये कर्जांचे एकत्रित विश्लेषण दिसते. गटाने वाटप केलेले एकूण भांडवल, व्याजातून झालेली कमाई, आणि कर्ज वसुलीची गती येथे एका दृष्टिक्षेपात पाहता येते."
        }
    },
    {
        "id": "scene_14",
        "start": 305.0,
        "max_window": 20.0,
        "title": "Taaleband / Monthly Balance Strict Separation",
        "en": {
            "rate": "+15%",
            "text": "The cornerstone of Bachat Gat auditing is the Monthly Balance Report, known traditionally as Taaleband. Our system enforces strict column separation: Regular Savings, Loan Principal, and Interest Earnings are tracked in mutually exclusive columns with zero commingling."
        },
        "hi": {
            "rate": "+10%",
            "text": "बचत गट ऑडिट का सबसे महत्वपूर्ण हिस्सा है मासिक ताळेबंद रिपोर्ट। हमारा सिस्टम सख्त नियम का पालन करता है: नियमित बचत, लोन मूलधन, और ब्याज—इन तीनों के अलग-अलग कॉलम होते हैं। कोई भी फंड आपस में नहीं मिलता।"
        },
        "mr": {
            "rate": "+10%",
            "text": "बचत गट तपासणीचा मुख्य आधार म्हणजे मासिक ताळेबंद अहवाल. आपली प्रणाली काटेकोर नियमांचे पालन करते: नियमित बचत, कर्ज मुद्दल, आणि व्याज हे तीन स्वतंत्र स्तंभांमध्ये नोंदवले जातात, ज्यामुळे शासकीय ऑडिटची पूर्तता होते."
        }
    },
    {
        "id": "scene_15",
        "start": 326.0,
        "max_window": 14.5,
        "title": "Final Reconciliation & Balance Check",
        "en": {
            "rate": "+26%",
            "text": "Returning to the dashboard, we confirm reconciliation: Available Cash of ₹15,600 plus Active Loans of ₹4,500 matches Total Group Fund of ₹20,100 with zero variance."
        },
        "hi": {
            "rate": "+24%",
            "text": "डैशबोर्ड पर हम मिलान देखते हैं: ₹15,600 बैंक बैलेंस और ₹4,500 एक्टिव लोन मिलकर कुल ₹20,100 ग्रुप फंड के बराबर हैं, शून्य अंतर के साथ।"
        },
        "mr": {
            "rate": "+25%",
            "text": "डॅशबोर्डवर आपण हिशोब पाहतो: बँकेतील ₹15,600 शिल्लक आणि ₹4,500 कर्ज मिळून एकूण ₹20,100 निधीची तंतोतंत जुळणी होते, शून्य फरकासह."
        }
    },
    {
        "id": "scene_16",
        "start": 341.5,
        "max_window": 12.5,
        "title": "Project Summary & Conclusion",
        "en": {
            "rate": "+16%",
            "text": "In conclusion, the Bachat Gat platform delivers robust microfinance management, automated lending, and strict Taaleband reconciliation. Thank you."
        },
        "hi": {
            "rate": "+16%",
            "text": "निष्कर्ष रूप में, यह बचत गट मैनेजमेंट सिस्टम दोहरे सदस्य विभाजन, 10 महीने के लोन, और ताळेबंद समाधान को पूरी तरह स्वचालित करता है। धन्यवाद।"
        },
        "mr": {
            "rate": "+16%",
            "text": "थोडक्यात सांगायचे तर, ही प्रणाली सभासद वर्गीकरण, १० महिन्यांचे कर्ज वाटप, आणि मासिक ताळेबंद पूर्णपणे स्वयंचलित करते. धन्यवाद."
        }
    }
]

def format_srt_time(seconds):
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms >= 1000:
        secs += 1
        ms -= 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"

def format_ass_time(seconds):
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        secs += 1
        cs -= 100
    return f"{hrs:d}:{mins:02d}:{secs:02d}.{cs:02d}"

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

async def generate_scene_clip(text, voice, rate, output_path):
    c = edge_tts.Communicate(text, voice, rate=rate)
    await c.save(str(output_path))

def create_silence_mp3(duration, output_path):
    cmd = [
        FFMPEG_PATH, "-y",
        "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", str(duration),
        "-c:a", "libmp3lame", "-b:a", "64k",
        str(output_path)
    ]
    subprocess.run(cmd, check=True, capture_output=True)

def split_into_phrases(text):
    import re
    raw_sentences = re.split(r'([.!?।॥]\s*)', text)
    sentences = []
    current = ""
    for piece in raw_sentences:
        current += piece
        if piece.strip() in ['.', '!', '?', '।', '॥'] or len(piece) > 0 and piece[-1] in ['.', '!', '?', '।', '॥']:
            if current.strip():
                sentences.append(current.strip())
            current = ""
    if current.strip():
        sentences.append(current.strip())
    if not sentences:
        sentences = [text]
    return sentences

async def step1_generate_scene_audios():
    print("\n" + "="*80)
    print("STEP 1: GENERATING SCENE AUDIO CLIPS WITH EDGE-TTS")
    print("="*80)
    
    clip_metadata = {"en": [], "hi": [], "mr": []}
    
    for idx, scene in enumerate(SCENES):
        scene_id = scene["id"]
        start_t = scene["start"]
        max_w = scene["max_window"]
        print(f"\n[{idx+1:02d}/16] {scene_id}: '{scene['title']}' (Starts @ {start_t}s, Max Window: {max_w}s)")
        
        for lang in ["en", "hi", "mr"]:
            voice = VOICES[lang]["voice"]
            spec = scene[lang]
            text = spec["text"]
            rate = spec["rate"]
            clip_file = TEMP_AUDIO_DIR / f"{scene_id}_{lang}.mp3"
            
            await generate_scene_clip(text, voice, rate, clip_file)
            dur = get_audio_duration(clip_file)
            
            status = "✔ OK" if dur <= max_w else "⚠ OVER"
            print(f"   [{lang.upper()}] {dur:.2f}s / {max_w}s [{rate}] -> {status}")
            
            if dur > max_w:
                print(f"   WARNING: {lang.upper()} exceeds max window by {dur - max_w:.2f}s!")
            
            clip_metadata[lang].append({
                "scene_id": scene_id,
                "title": scene["title"],
                "start": start_t,
                "duration": dur,
                "text": text,
                "file": str(clip_file)
            })
            
    with open(TEMP_AUDIO_DIR / "final_clip_metadata.json", "w", encoding="utf-8") as f:
        json.dump(clip_metadata, f, indent=2, ensure_ascii=False)
        
    return clip_metadata

def step2_assemble_full_audio_tracks(clip_metadata):
    print("\n" + "="*80)
    print("STEP 2: ASSEMBLING CONTINUOUS AUDIO TRACKS WITH PRECISE SILENCE BUFFERS")
    print("="*80)
    
    assembled_files = {}
    
    for lang in ["en", "hi", "mr"]:
        print(f"\n>>> Building full continuous track for {lang.upper()} ({VOICES[lang]['title']})...")
        clips = clip_metadata[lang]
        concat_list_path = TEMP_AUDIO_DIR / f"concat_list_{lang}.txt"
        
        file_lines = []
        current_time = 0.0
        
        for idx, clip in enumerate(clips):
            target_start = clip["start"]
            clip_dur = clip["duration"]
            clip_path = Path(clip["file"]).resolve()
            
            # Insert silence buffer if needed before this scene
            if target_start > current_time:
                silence_dur = target_start - current_time
                silence_file = TEMP_AUDIO_DIR / f"silence_{lang}_{idx}_{silence_dur:.3f}.mp3"
                create_silence_mp3(silence_dur, silence_file)
                file_lines.append(f"file '{silence_file.as_posix()}'")
                current_time += silence_dur
                
            # Add scene audio
            file_lines.append(f"file '{clip_path.as_posix()}'")
            current_time += clip_dur
            
        # Final trailing silence to match total video duration exactly
        if current_time < TOTAL_VIDEO_DURATION:
            trail_dur = TOTAL_VIDEO_DURATION - current_time
            trail_file = TEMP_AUDIO_DIR / f"trail_{lang}_{trail_dur:.3f}.mp3"
            create_silence_mp3(trail_dur, trail_file)
            file_lines.append(f"file '{trail_file.as_posix()}'")
            current_time += trail_dur
            
        with open(concat_list_path, "w", encoding="utf-8") as f:
            f.write("\n".join(file_lines))
            
        output_lang_mp3 = AUDIO_DIR / f"{VOICES[lang]['title'].lower()}.mp3"
        
        cmd = [
            FFMPEG_PATH, "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_list_path),
            "-t", str(TOTAL_VIDEO_DURATION),
            "-c:a", "libmp3lame", "-b:a", "128k",
            str(output_lang_mp3)
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        final_dur = get_audio_duration(output_lang_mp3)
        assembled_files[lang] = output_lang_mp3
        print(f"   ✔ Created {output_lang_mp3.name}: Duration = {final_dur:.2f}s (Target: {TOTAL_VIDEO_DURATION:.2f}s)")
        
    return assembled_files

def step3_generate_synchronized_subtitles(clip_metadata):
    print("\n" + "="*80)
    print("STEP 3: GENERATING SYNCHRONIZED SRT AND ASS SUBTITLES")
    print("   Styling: Black text (#000000), white semi-transparent box (~88% opacity), bottom-center, max 2 lines")
    print("="*80)
    
    srt_files = {}
    ass_files = {}
    
    ass_header = """[Script Info]
Title: Bachat Gat Digital Savings Group Presentation
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Segoe UI,30,&H00000000,&H000000FF,&H00000000,&H20FFFFFF,-1,0,0,0,100,100,0,0,3,0,0,2,60,60,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    for lang in ["en", "hi", "mr"]:
        clips = clip_metadata[lang]
        lang_title = VOICES[lang]['title'].lower()
        srt_file = SUBTITLES_DIR / f"{lang_title}.srt"
        ass_file = SUBTITLES_DIR / f"{lang_title}.ass"
        
        srt_entries = []
        ass_events = []
        cue_idx = 1
        
        for clip in clips:
            scene_start = clip["start"]
            scene_dur = clip["duration"]
            phrases = split_into_phrases(clip["text"])
            
            total_chars = sum(len(p) for p in phrases)
            elapsed = 0.0
            
            for phrase in phrases:
                phrase_fraction = len(phrase) / max(total_chars, 1)
                phrase_dur = scene_dur * phrase_fraction
                
                phrase_start = scene_start + elapsed
                phrase_end = phrase_start + phrase_dur
                elapsed += phrase_dur
                
                # Format for SRT
                start_srt = format_srt_time(phrase_start)
                end_srt = format_srt_time(phrase_end)
                srt_entries.append(f"{cue_idx}\n{start_srt} --> {end_srt}\n{phrase}\n")
                
                # Format for ASS
                start_ass = format_ass_time(phrase_start)
                end_ass = format_ass_time(phrase_end)
                ass_phrase = phrase.replace("\n", "\\N")
                ass_events.append(f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{ass_phrase}")
                
                cue_idx += 1
                
        with open(srt_file, "w", encoding="utf-8") as f:
            f.write("\n".join(srt_entries) + "\n")
            
        with open(ass_file, "w", encoding="utf-8") as f:
            f.write(ass_header + "\n".join(ass_events) + "\n")
            
        srt_files[lang] = srt_file
        ass_files[lang] = ass_file
        print(f"   ✔ Generated {srt_file.name} & {ass_file.name} with {cue_idx-1} timed cues")
        
    return srt_files, ass_files

def step4_build_multilingual_containers(assembled_audio, srt_files):
    print("\n" + "="*80)
    print("STEP 4: MULTIPLEXING MASTER MULTILINGUAL MKV AND PRESENTATION MP4")
    print("="*80)
    
    mkv_output = DEMO_OUTPUT_DIR / "Bachat-Gat-Digital-Savings-Group-Final-Multilingual.mkv"
    mp4_output = DEMO_OUTPUT_DIR / "Bachat-Gat-Digital-Savings-Group-Final.mp4"
    
    en_audio = assembled_audio["en"]
    hi_audio = assembled_audio["hi"]
    mr_audio = assembled_audio["mr"]
    
    en_srt = srt_files["en"]
    hi_srt = srt_files["hi"]
    mr_srt = srt_files["mr"]
    
    print(f"\n>>> Creating Master MKV: {mkv_output.name}...")
    mkv_cmd = [
        FFMPEG_PATH, "-y",
        "-i", str(SOURCE_VIDEO),
        "-i", str(en_audio),
        "-i", str(hi_audio),
        "-i", str(mr_audio),
        "-i", str(en_srt),
        "-i", str(hi_srt),
        "-i", str(mr_srt),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-map", "2:a:0",
        "-map", "3:a:0",
        "-map", "4:s:0",
        "-map", "5:s:0",
        "-map", "6:s:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-t", str(TOTAL_VIDEO_DURATION),
        "-c:a", "libmp3lame", "-b:a", "192k",
        "-c:s", "srt",
        "-metadata:s:a:0", "language=eng",
        "-metadata:s:a:0", "title=English",
        "-metadata:s:a:1", "language=hin",
        "-metadata:s:a:1", "title=Hindi",
        "-metadata:s:a:2", "language=mar",
        "-metadata:s:a:2", "title=Marathi",
        "-metadata:s:s:0", "language=eng",
        "-metadata:s:s:0", "title=English",
        "-metadata:s:s:1", "language=hin",
        "-metadata:s:s:1", "title=Hindi",
        "-metadata:s:s:2", "language=mar",
        "-metadata:s:s:2", "title=Marathi",
        "-disposition:a:0", "default",
        "-disposition:s:0", "default",
        str(mkv_output)
    ]
    
    subprocess.run(mkv_cmd, check=True)
    mkv_stat = mkv_output.stat()
    print(f"   ✔ Master MKV created successfully! Size: {mkv_stat.st_size / (1024*1024):.2f} MB")
    
    print(f"\n>>> Creating Presentation MP4: {mp4_output.name}...")
    mp4_cmd = [
        FFMPEG_PATH, "-y",
        "-i", str(SOURCE_VIDEO),
        "-i", str(en_audio),
        "-i", str(en_srt),
        "-i", str(hi_srt),
        "-i", str(mr_srt),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-map", "2:s:0",
        "-map", "3:s:0",
        "-map", "4:s:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-t", str(TOTAL_VIDEO_DURATION),
        "-c:a", "aac", "-b:a", "192k",
        "-c:s", "mov_text",
        "-metadata:s:a:0", "language=eng",
        "-metadata:s:a:0", "title=English",
        "-metadata:s:s:0", "language=eng",
        "-metadata:s:s:0", "title=English",
        "-metadata:s:s:1", "language=hin",
        "-metadata:s:s:1", "title=Hindi",
        "-metadata:s:s:2", "language=mar",
        "-metadata:s:s:2", "title=Marathi",
        "-disposition:a:0", "default",
        "-disposition:s:0", "default",
        str(mp4_output)
    ]
    
    subprocess.run(mp4_cmd, check=True)
    mp4_stat = mp4_output.stat()
    print(f"   ✔ Presentation MP4 created successfully! Size: {mp4_stat.st_size / (1024*1024):.2f} MB")
    
    return mkv_output, mp4_output

def step5_verify_deliverables(mkv_output, mp4_output):
    print("\n" + "="*80)
    print("STEP 5: VERIFYING ALL DELIVERABLES AND STREAM METADATA")
    print("="*80)
    
    for path in [mkv_output, mp4_output]:
        print(f"\n>>> Probing {path.name}:")
        cmd = [
            FFPROBE_PATH, "-v", "error",
            "-show_entries", "format=duration,size,bit_rate:stream=index,codec_type,codec_name,channels,channel_layout:stream_tags=language,title",
            "-of", "json",
            str(path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        dur = float(data["format"]["duration"])
        size_mb = float(data["format"]["size"]) / (1024*1024)
        print(f"   Duration: {dur:.2f}s ({dur/60:.2f} min) | Size: {size_mb:.2f} MB")
        print(f"   Streams ({len(data['streams'])} total):")
        for s in data["streams"]:
            idx = s.get("index")
            stype = s.get("codec_type")
            codec = s.get("codec_name")
            tags = s.get("tags", {})
            lang = tags.get("language", "und")
            title = tags.get("title", "")
            print(f"     Stream #{idx}: [{stype.upper()}] {codec} (lang={lang}, title='{title}')")

async def main():
    print("🚀 Starting Bachat Gat Multi-Language Video Package Build...")
    clip_metadata = await step1_generate_scene_audios()
    assembled_audio = step2_assemble_full_audio_tracks(clip_metadata)
    srt_files, ass_files = step3_generate_synchronized_subtitles(clip_metadata)
    mkv_output, mp4_output = step4_build_multilingual_containers(assembled_audio, srt_files)
    step5_verify_deliverables(mkv_output, mp4_output)
    print("\n🎉 MULTILINGUAL DEMO VIDEO BUILD COMPLETE!")

if __name__ == "__main__":
    asyncio.run(main())
