export const themeScheme=snapshot=>snapshot?.active?.colorScheme==='light'?'light':snapshot?.active?.colorScheme==='dark'?'dark':null;
export const canvasBackground=(scheme,display)=>display?.background??(scheme==='light'?'#f7f8fb':'#0b0c10');
