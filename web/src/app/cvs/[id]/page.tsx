import CvsFlyer from "./CvsFlyer";

export function generateStaticParams() {
  return [
    { id: "gs25" },
    { id: "cu" },
    { id: "seven_eleven" },
  ];
}

export default function Page() {
  return <CvsFlyer />;
}
