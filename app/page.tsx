import ProviderPicker from "./components/provider-picker";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1>PlayNext</h1>
      <p>Pick a streaming service to browse what&apos;s on it.</p>
      <ProviderPicker />
    </main>
  );
}
