export const metadata = {
  title: "404 - Page Not Found | Harmony",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl mb-8">Page not found</p>
        <a href="/" className="text-red-500 hover:underline">
          Return to home
        </a>
      </div>
    </div>
  );
}



