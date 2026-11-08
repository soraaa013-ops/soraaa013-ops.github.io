document.getElementById("year").textContent = new Date().getFullYear();
const header = document.querySelector(".site-header");
const updateHeader = () => header.classList.toggle("scrolled", window.scrollY > 16);
window.addEventListener("scroll", updateHeader, { passive: true }); updateHeader();
