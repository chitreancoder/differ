import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { MainPane } from "./components/MainPane";
import { useSystemTheme } from "./theme";
import "./App.css";

function App() {
  useSystemTheme();
  return (
    <div className="app">
      <Sidebar />
      <div className="workspace">
        <TopBar />
        <MainPane />
      </div>
    </div>
  );
}

export default App;
