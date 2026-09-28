export const metadata = {
  title: 'BRINE-HOUSE - ระบบสั่งอาหาร',
  description: 'ระบบสั่งอาหารร้าน BRINE-HOUSE',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
