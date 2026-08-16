import { siWhatsapp, siTelegram, siFacebook, siX } from "simple-icons";

// SVG oficial de cada marca via pacote simple-icons (open-source, mantido
// especificamente pra replicar marca com precisão) — em vez de um SVG
// escrito à mão, que arrisca ficar desatualizado ou impreciso.
function svgMarca(icone) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="#${icone.hex}" aria-hidden="true"><path d="${icone.path}"/></svg>`;
}

export const ICONES_COMPARTILHAR = {
  WhatsApp: svgMarca(siWhatsapp),
  Telegram: svgMarca(siTelegram),
  Facebook: svgMarca(siFacebook),
  X: svgMarca(siX),
};

// Monta os links de compartilhamento pra uma URL/texto — usado tanto na
// página de produto (URL fixa, calculada no build) quanto na de favoritos
// (URL só existe no cliente, já que depende de quem está favoritado).
export function linksCompartilhar(url, texto) {
  return [
    { rede: "WhatsApp", url: `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}` },
    { rede: "Telegram", url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}` },
    { rede: "Facebook", url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { rede: "X", url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}` },
  ].map((l) => ({ ...l, icone: ICONES_COMPARTILHAR[l.rede] }));
}
