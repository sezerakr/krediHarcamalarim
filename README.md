# Kredi Harcamalarım

Kredi Harcamalarım, kredi kartı ekstrelerinizi yükleyip analiz edebileceğiniz, harcamalarınızı kategorize edip geleceğe yönelik akıllı tahminler alabileceğiniz modern bir kişisel finans ve gösterge paneli uygulamasıdır.

## Proje Mimarisi ve Yapısı


### Kullanılan Teknolojiler

- **Frontend :** 
  - **Framework:** Angular
  - **Tasarım Dili:** Özel CSS/SCSS (Premium Glassmorphism, Modern ve Dinamik Arayüz)
  - **Özellikler:** Sürükle-bırak dosya yükleme, dinamik harcama tabloları, analitik grafikler.

- **Backend :**
  - **Runtime:** Deno
  - **Web Framework:** Hono
  - **Veritabanı:** SQLite (`dev.db`)
  - **Özellikler:** JWT tabanlı kimlik doğrulama, ekstre okuma/ayrıştırma, kategorizasyon ve harcama tahmini.

### Klasör Yapısı (Özet)

```text
krediHarcamalarim/
├── frontend/                 # İstemci Uygulaması (Angular)
│   ├── src/
│   │   ├── app/              # Ana modüller, sayfalar (Dashboard, Upload) ve bileşenler
│   │   ├── assets/           # Görseller, ikonlar vb. statik dosyalar
│   │   └── styles.scss       # Global tasarım ve stil dosyaları
│   ├── angular.json          # Angular proje ayarları
│   └── package.json          # Node modülleri ve npm scriptleri
│
└── backend/                  # Sunucu Uygulaması (Deno & Hono)
    ├── src/
    │   ├── db/               # SQLite veritabanı bağlantısı ve istemci fonksiyonları
    │   ├── routes/           # API yönlendirmeleri (Auth, Statements, Predictions)
    │   └── utils/            # JWT doğrulama ve diğer yardımcı araçlar
    ├── dev.db                # Yerel geliştirme veritabanı dosyası
    ├── main.ts               # Deno sunucusunun başlatıldığı ana dosya (Port: 3005)
    └── deno.json             # Deno yapılandırmaları ve bağımlılıkları
```

---

## Yerel Geliştirme (Local Development)

Projeyi kendi bilgisayarınızda çalıştırmak için aşağıdaki adımları takip edebilirsiniz.

### 1. Backend (API) Başlatma
Sisteminizde **Deno** kurulu olmalıdır.
```bash
cd backend
deno run dev
```
*(Backend sunucusu `http://localhost:3005` adresinde çalışmaya başlayacaktır.)*

### 2. Frontend (Arayüz) Başlatma
Sisteminizde **Node.js** kurulu olmalıdır.
```bash
cd frontend
npm install
npm run start
```
*(Frontend uygulaması derlenecek ve `http://localhost:4200` adresinde açılacaktır.)*
