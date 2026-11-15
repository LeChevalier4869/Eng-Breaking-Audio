# GoodEar — English listening practice

เว็บแอปฝึกฟังภาษาอังกฤษแบบเรียบง่าย รองรับล็อกอินด้วย Google หรืออีเมล/รหัสผ่าน จดโน้ตแยกตามเสียง และดูจำนวนครั้งที่ฟังจบ เช็คอิน วันเรียน วันที่ขาดเรียน และสถิติเรียนต่อเนื่อง

## ตั้งค่า Firebase

1. สร้าง Firebase project และเพิ่ม Web app ใน [Firebase Console](https://console.firebase.google.com/).
2. เปิด **Authentication** แล้วเปิดผู้ให้บริการ **Google** และ **Email/Password**.
3. เพิ่มโดเมนที่ใช้เปิดเว็บใน **Authentication → Settings → Authorized domains**.
4. สร้าง Firestore database ในโหมด production.
5. คัดลอก Firebase web app config ไปใส่ใน `public/firebase-config.js` (ค่า config ฝั่งเว็บไม่ใช่ service account key).

ข้อมูลโน้ตและสถิติจะถูกเก็บแยกตาม Firebase user ID และกฎใน `firestore.rules` จำกัดการอ่าน/เขียนไว้เฉพาะข้อมูลของผู้ใช้คนนั้น

## เพิ่มไฟล์เสียง

เลือกไฟล์เสียงจากปุ่ม **เพิ่มไฟล์เสียง** เพื่อฟังใน session ปัจจุบันได้ หรือเพิ่มไฟล์ที่ต้องการ deploy ไว้ใน `public/audio/` แล้วใส่รายการใน `public/audio/playlist.json`:

```json
[
  { "name": "Lesson 01", "src": "./audio/lesson-01.mp3" }
]
```

ไฟล์ที่เลือกจากเครื่องจะไม่ถูกอัปโหลดไปยังเว็บและจะต้องเลือกใหม่เมื่อเปิด session ถัดไป หากต้องการให้ทุกอุปกรณ์เข้าถึงเสียง ให้ deploy ไฟล์ไว้ใน `public/audio/`.

## Deploy ด้วย Firebase Hosting

ติดตั้ง Firebase CLI แล้วรันจากโฟลเดอร์โปรเจกต์:

```sh
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

เลือก Firebase project ที่สร้างไว้เมื่อ `firebase use --add` และ deploy ซ้ำเมื่อเปลี่ยน Firebase config, Firestore rules หรือไฟล์เว็บ

## ทดลองในเครื่อง

เว็บใช้ ES modules จึงควรเปิดผ่าน local web server ไม่ใช่เปิด `index.html` โดยตรง เช่น:

```sh
python3 -m http.server 8000 --directory public
```

จากนั้นเปิด `http://localhost:8000` โดยต้องตั้งค่า Firebase ก่อนจึงจะใช้ล็อกอินและบันทึกข้อมูลได้