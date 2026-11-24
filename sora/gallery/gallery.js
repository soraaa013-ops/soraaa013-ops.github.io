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
    item.title + " · " + item.style;
  if (!dialog.open) dialog.showModal();
}

function filter(style) {
  selected =
    style === "全部" ? catalog : catalog.filter((item) => item.style === style);
  for (const button of filters.children)
    button.setAttribute("aria-pressed", button.textContent === style);
  works.replaceChildren(
    ...selected.map((item, index) => {
      const button = document.createElement("button");
      button.className = "work";
      const image = document.createElement("img");
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

for (const style of ["全部", ...new Set(catalog.map((item) => item.style))]) {
  const button = document.createElement("button");
  button.textContent = style;
  button.onclick = () => filter(style);
  filters.append(button);
}
document.querySelector("#prev").onclick = () => show(current - 1);
document.querySelector("#next").onclick = () => show(current + 1);
document.querySelector("#close").onclick = () => dialog.close();
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") show(current - 1);
  if (event.key === "ArrowRight") show(current + 1);
});
filter("全部");
