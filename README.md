# HarmonyWatch - Streaming Platform

A modern streaming platform built with Next.js, React, and Tailwind CSS.

## 🚀 Live Demo

Visit the live site: [https://harmonydev777.github.io/harmonywatchv1/](https://harmonydev777.github.io/harmonywatchv1/)

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Fonts**: Jano Sans Pro (Custom)
- **Deployment**: GitHub Pages

## 📦 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/harmonydev777/harmonywatchv1.git
cd harmonywatchv1
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment variables

Create a `.env.local` file (or configure your deployment environment) with the following keys:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_MONTHLY_PRICE_ID` – use Stripe Price ID mapped to product `prod_TP7ICj3P7MyvVq`
- `STRIPE_YEARLY_PRICE_ID` – use Stripe Price ID mapped to product `prod_TP7Jb9KtwmEWQh`
- `STRIPE_WEBHOOK_SECRET` – signing secret for the Stripe webhook endpoint
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pre-populated for local dev, override for production)

All Stripe values should come from your Stripe dashboard; never commit real secrets to source control.

## 🚀 Deployment

### Web Deployment

#### Automatic Deployment (GitHub Actions)

The project is set up with GitHub Actions for automatic deployment. Every push to the `main` branch will automatically deploy to GitHub Pages.

#### Manual Deployment

**Option 1: Using npm script**
```bash
npm run deploy
```

**Option 2: Using deployment scripts**
- Windows: `deploy.bat`
- Linux/Mac: `./deploy.sh`

**Option 3: Manual Git commands**
```bash
git add .
git commit -m "Deploy: $(date)"
git push origin main
```

### iOS Native App (Capacitor + VoltBuilder)

The app can be packaged as a native iOS app using Capacitor and VoltBuilder.

#### Prerequisites
- Node.js 18+
- VoltBuilder account

#### Building for iOS

1. **Sync Capacitor:**
   ```bash
   npm run build:capacitor
   ```

2. **Create VoltBuilder Package:**
   ```bash
   npm run package:volt:capacitor
   ```

3. **Upload to VoltBuilder:**
   - Upload `dist/capacitor-project.zip` to VoltBuilder dashboard
   - Configure signing certificates and App Store Connect in VoltBuilder UI
   - VoltBuilder will build and upload to App Store Connect automatically

#### Adding Android Support

To add Android support later:
```bash
npx cap add android
npm run package:volt:capacitor  # Will include android/ directory
```

#### Available Scripts

- `npm run build:capacitor` - Sync Capacitor configuration
- `npm run cap:sync` - Sync web assets to native projects
- `npm run cap:open` - Open in Xcode (if available)
- `npm run package:volt:capacitor` - Create VoltBuilder zip package

## 📁 Project Structure

```
harmonywatchv1/
├── app/
│   ├── components/          # React components
│   ├── video-page/         # Video player page
│   ├── lib/               # Data and utilities
│   └── globals.css        # Global styles
├── public/
│   ├── images/            # Static images
│   ├── fonts/             # Custom fonts
│   └── dummy-videos/      # Video assets
├── .github/
│   └── workflows/         # GitHub Actions
└── deploy.*               # Deployment scripts
```

## 🎨 Features

- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Hero Carousel**: Dynamic content showcase
- **Content Shelves**: Horizontal scrolling categories
- **Hover Previews**: Interactive content previews
- **Video Player**: Full-featured video playback
- **Modal System**: Content detail popups
- **Custom Fonts**: Jano Sans Pro typography

## 🔧 Configuration

The project is configured for GitHub Pages deployment with:
- Static export enabled
- Optimized images
- Proper asset paths
- GitHub Actions workflow

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## 💳 Stripe Integration

### Testing
See `docs/stripe-subscription-testing.md` for an end-to-end checklist and Stripe CLI smoke tests that exercise the webhook pipeline before each release.

### Production Setup
See `docs/stripe-production-setup.md` for a complete guide on switching from test to production Stripe keys, including webhook configuration and security best practices.

## 📄 License

This project is private and proprietary.
