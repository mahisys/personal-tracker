/** Runs before first paint to apply the saved (or system) theme without a flash. */
export const THEME_SCRIPT = `(()=>{try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
