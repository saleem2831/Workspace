/** Five independently configurable workspace color palettes. Pure presentation. */
export type ThemeId = 'violet'|'ocean'|'emerald'|'sunset'|'slate';
export const THEMES:{id:ThemeId;label:string;accent:string;soft:string}[] = [
  {id:'violet',label:'Violet',accent:'#5136cf',soft:'#eeeaff'},
  {id:'ocean',label:'Ocean Blue',accent:'#136ac6',soft:'#e6f2ff'},
  {id:'emerald',label:'Emerald',accent:'#078569',soft:'#e4f8ef'},
  {id:'sunset',label:'Sunset',accent:'#bf4d28',soft:'#fff0e7'},
  {id:'slate',label:'Slate',accent:'#46546b',soft:'#edf1f7'},
];
export default function ThemePicker({value,onChange,disabled=false}:{value:ThemeId;onChange:(id:ThemeId)=>void;disabled?:boolean}){
  return <div className="tenant-theme-picker" role="radiogroup" aria-label="Workspace colour theme">
    {THEMES.map(t=><button key={t.id} type="button" className={`tenant-theme-option ${value===t.id?'selected':''}`}
      role="radio" aria-checked={value===t.id} disabled={disabled} onClick={()=>onChange(t.id)}>
      <span className="tenant-theme-dot" style={{background:t.accent,boxShadow:`0 0 0 5px ${t.soft}`}}/>
      <span>{t.label}</span>{value===t.id&&<span aria-hidden="true">✓</span>}
    </button>)}
  </div>;
}
