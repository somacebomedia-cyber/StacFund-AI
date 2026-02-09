/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Keep this just in case
    "./**/*.{js,ts,jsx,tsx}", // This covers everything in root and subfolders
    "!./node_modules/**", // Exclude node_modules
    "!./dist/**" // Exclude dist
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}