const works = document.querySelector("#works");
const filters = document.querySelector("#filters");
const dialog = document.querySelector("dialog");
let selected = catalog;
let current = 0;

function show(index) {
  current = (index + selected.length) % selected.length;
  const item = selected[current];
  document.querySelector("#large").src = item.src;
  document.querySelector("#large").alt = item.title;
  document.querySelector("#caption").textContent =
    [item.title, item.style, item.note].filter(Boolean).join(" · ");
  if (!dialog.open) dialog.showModal();
}

function filter(style) {
  selected =
    style === "全部" ? catalog : catalog
      .filter((item) => item.style === style)
      .sort((left, right) => left.number.localeCompare(right.number));
  for (const button of filters.children)
    button.setAttribute("aria-pressed", button.textContent === style);
  works.replaceChildren(
    ...selected.map((item, index) => {
      const button = document.createElement("button");
      button.className = "work";
      const image = document.createElement("img");
      if (!item.src.startsWith("art/")) button.classList.add("sheet");
      image.src = item.thumb;
      image.loading = "lazy";
      image.alt = "";
      const caption = document.createElement("span");
      const number = document.createElement("small");
      number.textContent = item.number;
      caption.append(number, item.title);
      button.append(image, caption);
      button.onclick = () => show(index);
      return button;
    }),
  );
}

const styles = ["全部", ...new Set(catalog.map((item) => item.style))];
for (const style of styles) {
  const button = document.createElement("button");
  button.textContent = style;
  button.onclick = () => {
    const url = new URL(location.href);
    if (style === "全部") url.searchParams.delete("style");
    else url.searchParams.set("style", style);
    history.replaceState(null, "", url);
    filter(style);
  };
  filters.append(button);
}
document.querySelector("#prev").onclick = () => show(current - 1);
document.querySelector("#next").onclick = () => show(current + 1);
document.querySelector("#close").onclick = () => dialog.close();
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") show(current - 1);
  if (event.key === "ArrowRight") show(current + 1);
});
const initialStyle = new URLSearchParams(location.search).get("style");
filter(styles.includes(initialStyle) ? initialStyle : "全部");
