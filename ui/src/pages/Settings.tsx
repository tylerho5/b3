import { JudgeTemplateEditor } from "../components/settings/JudgeTemplateEditor";
import "../styles/settings.css";

export function Settings() {
  return (
    <div>
      <h2>Settings</h2>
      <section>
        <h3>Judge template</h3>
        <JudgeTemplateEditor />
      </section>
    </div>
  );
}
