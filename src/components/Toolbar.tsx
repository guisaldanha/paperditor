import { forwardRef, useState, useRef } from 'react';
import { Editor, useEditorState } from '@tiptap/react';
import './Toolbar.css';

// ── SVG Icon components ───────────────────────────────────────────────────────
type SP = { size?: number };

const IcoOpen      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IcoSave      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IcoPdf       = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>;
const IcoPrint     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const IcoUndo      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>;
const IcoRedo      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>;
const IcoBullet    = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>;
const IcoOrdered   = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2.5" y="8" fontSize="6.5" fill="currentColor" stroke="none" fontFamily="monospace">1.</text><text x="2.5" y="14" fontSize="6.5" fill="currentColor" stroke="none" fontFamily="monospace">2.</text><text x="2.5" y="20" fontSize="6.5" fill="currentColor" stroke="none" fontFamily="monospace">3.</text></svg>;
const IcoTask      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="5" height="5" rx="1"/><polyline points="4 7.5 5.5 9 8 6"/><line x1="12" y1="7" x2="21" y2="7"/><rect x="3" y="14" width="5" height="5" rx="1"/><line x1="12" y1="16" x2="21" y2="16"/></svg>;
const IcoQuote     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="4" x2="3" y2="20" strokeWidth="3.5"/><line x1="8" y1="8" x2="20" y2="8"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>;
const IcoCodeBlock = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const IcoHr        = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" strokeWidth="2.5"/><line x1="3" y1="6" x2="8" y2="6"/><line x1="3" y1="18" x2="8" y2="18"/></svg>;
const IcoLink      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
const IcoImage     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IcoAlignL    = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="10" x2="15" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="15" y2="18"/></svg>;
const IcoAlignC    = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="10" x2="18" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="6" y1="18" x2="18" y2="18"/></svg>;
const IcoAlignR    = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="9" y1="18" x2="21" y2="18"/></svg>;
const IcoAlignJ    = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const IcoSun       = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const IcoMoon      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

// ── Table-specific icons ──────────────────────────────────────────────────────
const IcoTableNew   = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;
const IcoRowAdd     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="18" height="13" rx="1.5"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="9" y1="2" x2="9" y2="15"/><line x1="15" y1="2" x2="15" y2="15"/><line x1="12" y1="19" x2="12" y2="24"/><line x1="9" y1="21.5" x2="15" y2="21.5"/></svg>;
const IcoRowDel     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="18" height="13" rx="1.5"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="9" y1="2" x2="9" y2="15"/><line x1="15" y1="2" x2="15" y2="15"/><line x1="9" y1="21" x2="15" y2="21"/></svg>;
const IcoColAdd     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="13" height="18" rx="1.5"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="2" y1="9" x2="15" y2="9"/><line x1="2" y1="15" x2="15" y2="15"/><line x1="19" y1="9" x2="19" y2="15"/><line x1="16" y1="12" x2="22" y2="12"/></svg>;
const IcoColDel     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="13" height="18" rx="1.5"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="2" y1="9" x2="15" y2="9"/><line x1="2" y1="15" x2="15" y2="15"/><line x1="17" y1="12" x2="23" y2="12"/></svg>;
const IcoHeaderRow  = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="3" y="3" width="18" height="7" rx="1" fill="currentColor" fillOpacity="0.18" stroke="none"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="9" y1="10" x2="9" y2="21"/><line x1="15" y1="10" x2="15" y2="21"/></svg>;
const IcoHeaderCol  = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="3" y="3" width="7" height="18" rx="1" fill="currentColor" fillOpacity="0.18" stroke="none"/><line x1="10" y1="3" x2="10" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/><line x1="10" y1="9" x2="21" y2="9"/><line x1="10" y1="15" x2="21" y2="15"/></svg>;
const IcoHeaderCell = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><rect x="3" y="3" width="6" height="6" fill="currentColor" fillOpacity="0.28" stroke="none"/></svg>;
const IcoWrench     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
const IcoTrash      = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoFootnote  = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16"/><path d="M4 15h16"/><text x="8" y="11" fontSize="8" fontWeight="bold" fill="currentColor" stroke="none">¹</text></svg>;
const IcoSmile     = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
const IcoToc       = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IcoFileOut   = ({size=15}: SP) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

// ── Emoji / icon data ─────────────────────────────────────────────────────────
const EMOJI_CATS = [
  {
    label: '😀', title: 'Faces',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐',
      '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    label: '✋', title: 'Gestures & Body',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🫶','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','👁️','👀','👅','👄','🦷','🦴',
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵',
      '👮','👷','💂','🕵️','👩‍⚕️','👨‍⚕️','👩‍🌾','👨‍🌾','👩‍🍳','👨‍🍳','👩‍🎓','👨‍🎓','👩‍🎤','👨‍🎤','👩‍🏫','👨‍🏫','👩‍🔧','👨‍🔧','👩‍💼','👨‍💼','👩‍🔬','👨‍🔬','👩‍🎨','👨‍🎨','👩‍✈️','👨‍✈️','👩‍🚀','👨‍🚀','👩‍🚒','👨‍🚒','👩‍💻','👨‍💻',
      '🧙','🧛','🧟','🧜','🧚','👼','🎅','🤶','🦸','🦹',
    ],
  },
  {
    label: '👗', title: 'Clothing & Accessories',
    emojis: [
      '👔','👕','👖','🧣','🧤','🧥','🧦','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🎒','🧳','👒','🎩','🎓','🪖','⛑️','💄','💍','💎','📿','👓','🕶️','🥽','🌂','☂️','🧵','🧶','🪡','🪢',
      '👞','👟','🥾','🥿','👠','👡','🩰','👢','👑','💄','💋','👄','🦷','🦺','🩺','🏷️',
    ],
  },
  {
    label: '🐶', title: 'Animals',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🦆','🐔','🐧','🐦','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🕷️','🕸️','🦂',
      '🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🪸','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭',
      '🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔',
    ],
  },
  {
    label: '🌱', title: 'Nature',
    emojis: [
      '🌱','🌿','☘️','🍀','🎋','🎍','🍃','🍂','🍁','🪴','🌾','🌵','🌴','🌳','🌲','🪵','🪨','🌺','🌸','💐','🌼','🌻','🌹','🥀','🌷','🪷','🍄','🌰','🪸',
      '🌍','🌎','🌏','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','🌚','🌛','🌜','🌝','🌞','⭐','🌟','✨','💫','🌠','☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌀','🌈','☁️','🌫️','🌪️','🔥','💧','🌊','⚡','☔','⛱️','🌡️',
      '⛰️','🏔️','🗻','🌋','🏕️','🏖️','🏜️','🏝️','🏞️','🌁','🌃','🌆','🌇','🌉','🌌','🎆','🎇',
    ],
  },
  {
    label: '🍕', title: 'Food & Drink',
    emojis: [
      '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🍅','🫒','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🫘','🌰',
      '🍞','🥐','🥖','🫓','🥨','🥯','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥗','🥘','🫕','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡',
      '🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯',
      '🍼','🥛','☕','🫖','🍵','🧃','🥤','🧋','🫗','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️','🥢','🫙',
    ],
  },
  {
    label: '💻', title: 'Objects & Technology',
    emojis: [
      '📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','🧮','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯️',
      '📔','📒','📕','📗','📘','📙','📚','📖','📰','🗞️','📓','📃','📄','📑','🗒️','🗓️','📅','📆','🗑️','📊','📈','📉','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗂️','🗳️','✒️','✏️','📝','🖊️','🖋️','🖌️','🖍️',
      '🔍','🔎','🔏','🔐','🔒','🔓','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🔧','🪛','🔩','⚙️','🗜️','⚖️','🔗','⛓️','🪝','🧲','🪜','🧰','🧱','🪤','💈','🧴','🧷','🧹','🧺','🧻','🪣','🧽','🧯','🛒','🚪','🛏️','🛋️','🪑','🪞','🪟',
    ],
  },
  {
    label: '🎮', title: 'Activities & Sports',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🏐','🏉','🥏','🎾','🪃','🏸','🏒','🏑','🥍','🏏','🪁','🛹','🛼','⛸️','🥅','⛳','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪀','🎱','🎰','🎲','♟️','🧩',
      '🎮','🕹️','🎴','🃏','🀄','🎭','🎨','🖼️','🎬','🎤','🎧','🎼','🎵','🎶','🎷','🪗','🎸','🎹','🎺','🎻','🪕','🥁','🪘','🎙️',
      '🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎠','🎡','🎢',
      '🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🛤️','🏹','🤼','🏂','🪂',
    ],
  },
  {
    label: '🚗', title: 'Travel & Places',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','⛽','🚨','🚥','🚦','🛑','🚧',
      '⚓','🛟','⛵','🚤','🛥️','🛳️','⛴️','🚢',
      '✈️','🛩️','🛫','🛬','🪂','💺','🚁','🛰️','🚀','🛸',
      '🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🛤️',
      '🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','🗺️','🧭',
    ],
  },
  {
    label: '❤️', title: 'Symbols',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','❤️‍🔥','❤️‍🩹',
      '✅','❎','⭕','❌','❓','❔','❕','❗','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫',
      '♻️','⚠️','🚫','🔕','📵','🔇','🔈','🔉','🔊','📣','📢','🔔','🔕','💹','🏧','💱','💲','⚜️','🔱','🔰','♾️','☑️','✔️','✖️','➕','➖','➗','✳️','✴️','❇️','©️','®️','™️',
      '⬆️','↗️','➡️','↘️','⬇️','↙️','⬅️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔃','🔄','🔙','🔚','🔛','🔜','🔝',
      '🎵','🎶','〽️','♨️','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛',
    ],
  },
];

// ── Group wrapper with label ──────────────────────────────────────────────────
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="toolbar-group-wrap">
      <div className="toolbar-group">{children}</div>
      <span className="toolbar-group-label">{label}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
type ToolbarTab = 'general' | 'tables' | 'reading';

interface ToolbarProps {
  editor: Editor | null;
  onOpen: () => void;
  onSave: () => void;
  onExportPdf: () => void;
  onExportHtml: () => void;
  onExportDocx: () => void;
  onPrint: () => void;
  onToggleTheme: () => void;
  onToggleMode: () => void;
  isDark: boolean;
  isMarkdownMode: boolean;
  isDirty: boolean;
  activeTab: ToolbarTab;
  onTabChange: (tab: ToolbarTab) => void;
  showToc: boolean;
  onToggleToc: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar({
  editor,
  onOpen,
  onSave,
  onExportPdf,
  onExportHtml,
  onExportDocx,
  onPrint,
  onToggleTheme,
  onToggleMode,
  isDark,
  isMarkdownMode,
  isDirty,
  activeTab,
  onTabChange,
  showToc,
  onToggleToc,
}, ref) {
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [showFootnotePopover, setShowFootnotePopover] = useState(false);
  const [footnoteText, setFootnoteText] = useState('');
  const footnoteCounter = useRef(1);
  const [showIconPopover, setShowIconPopover] = useState(false);
  const [iconCat, setIconCat] = useState(0);

  // Reage a QUALQUER transação (incluindo apenas mover o cursor/seleção), não só a
  // mudanças de conteúdo — sem isso o toolbar (heading-select, Bold/Italic ativos etc.)
  // fica com o estado da última edição em vez do bloco onde o cursor está agora.
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      return {
        isBold: editor.isActive('bold'),
        isItalic: editor.isActive('italic'),
        isStrike: editor.isActive('strike'),
        isCode: editor.isActive('code'),
        isHighlight: editor.isActive('highlight'),
        isSuperscript: editor.isActive('superscript'),
        isSubscript: editor.isActive('subscript'),
        isLink: editor.isActive('link'),
        isBulletList: editor.isActive('bulletList'),
        isOrderedList: editor.isActive('orderedList'),
        isTaskList: editor.isActive('taskList'),
        isBlockquote: editor.isActive('blockquote'),
        isCodeBlock: editor.isActive('codeBlock'),
        alignLeft: editor.isActive('textAlign', { textAlign: 'left' }),
        alignCenter: editor.isActive('textAlign', { textAlign: 'center' }),
        alignRight: editor.isActive('textAlign', { textAlign: 'right' }),
        alignJustify: editor.isActive('textAlign', { textAlign: 'justify' }),
        headingValue:
          editor.isActive('heading', { level: 1 }) ? '1' :
          editor.isActive('heading', { level: 2 }) ? '2' :
          editor.isActive('heading', { level: 3 }) ? '3' :
          editor.isActive('heading', { level: 4 }) ? '4' :
          editor.isActive('heading', { level: 5 }) ? '5' :
          editor.isActive('heading', { level: 6 }) ? '6' : '0',
        canAddRow: editor.can().addRowAfter(),
        canAddCol: editor.can().addColumnAfter(),
      };
    },
  });

  if (!editor || !editorState) return null;

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleBold       = () => editor.chain().focus().toggleBold().run();
  const toggleItalic     = () => editor.chain().focus().toggleItalic().run();
  const toggleStrike     = () => editor.chain().focus().toggleStrike().run();
  const toggleCode       = () => editor.chain().focus().toggleCode().run();
  const toggleHighlight  = () => editor.chain().focus().toggleHighlight().run();
  const toggleSuperscript = () => editor.chain().focus().toggleSuperscript().run();
  const toggleSubscript  = () => editor.chain().focus().toggleSubscript().run();

  const setHeading = (level: number) => {
    if (level === 0) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: level as 1|2|3|4|5|6 }).run();
  };

  const toggleBulletList  = () => editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
  const toggleTaskList    = () => editor.chain().focus().toggleTaskList().run();
  const toggleBlockquote  = () => editor.chain().focus().toggleBlockquote().run();
  const toggleCodeBlock   = () => editor.chain().focus().toggleCodeBlock().run();
  const setHorizontalRule = () => editor.chain().focus().setHorizontalRule().run();

  const insertLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setShowLinkPopover(false);
    }
  };
  const removeLink = () => editor.chain().focus().unsetLink().run();

  const insertImage = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl, alt: imageAlt }).run();
      setImageUrl('');
      setImageAlt('');
      setShowImagePopover(false);
    }
  };

  const insertTable    = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const addTableRow    = () => editor.chain().focus().addRowAfter().run();
  const deleteTableRow = () => editor.chain().focus().deleteRow().run();
  const addTableCol    = () => editor.chain().focus().addColumnAfter().run();
  const deleteTableCol = () => editor.chain().focus().deleteColumn().run();
  const deleteTable    = () => editor.chain().focus().deleteTable().run();
  const undo           = () => editor.chain().focus().undo().run();
  const redo           = () => editor.chain().focus().redo().run();

  const addFootnote = () => {
    if (!footnoteText.trim()) return;
    const num = footnoteCounter.current++;
    const label = `[${num}]`;
    const text = footnoteText.trim();

    // 1. Guarda posição do cursor antes de qualquer inserção
    const cursorPos = editor.state.selection.from;

    // 2. Insere referência sobrescrita na posição do cursor
    editor.chain()
      .focus()
      .insertContentAt(cursorPos, { type: 'text', marks: [{ type: 'superscript' }], text: label })
      .run();

    // 3. Depois da inserção, adiciona parágrafo com o conteúdo da nota no fim do documento
    const endPos = editor.state.doc.content.size;
    editor.chain()
      .insertContentAt(endPos, {
        type: 'paragraph',
        content: [{ type: 'text', text: `${label} ${text}` }],
      })
      .run();

    setFootnoteText('');
    setShowFootnotePopover(false);
  };

  const insertIcon = (emoji: string) => {
    editor.chain().focus().insertContent(emoji).run();
    setShowIconPopover(false);
  };

  const {
    isBold, isItalic, isStrike, isCode, isHighlight, isSuperscript, isSubscript,
    isLink, isBulletList, isOrderedList, isTaskList, isBlockquote, isCodeBlock,
    alignLeft, alignCenter, alignRight, alignJustify, headingValue, canAddRow, canAddCol,
  } = editorState;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="toolbar" ref={ref}>

      {/* Tab strip */}
      <div className="toolbar-tabs">
        <button
          className={`toolbar-tab${activeTab === 'general' ? ' active' : ''}`}
          onClick={() => onTabChange('general')}
        >
          Home
        </button>
        <button
          className={`toolbar-tab${activeTab === 'tables' ? ' active' : ''}`}
          onClick={() => onTabChange('tables')}
        >
          Tables
        </button>
        <button
          className={`toolbar-tab${activeTab === 'reading' ? ' active' : ''}`}
          onClick={() => onTabChange('reading')}
        >
          Reading
        </button>
      </div>

      {/* Ribbon row */}
      <div className="toolbar-ribbon">
        <div className="toolbar-ribbon-left">

          {/* ── GENERAL ─────────────────────────────────────────────────────── */}
          {activeTab === 'general' && <>

            <Group label="File">
              <button className="toolbar-btn" onClick={onOpen}      title="Open (Ctrl+O)"><IcoOpen/></button>
              <button className={`toolbar-btn${isDirty ? ' dirty' : ''}`} onClick={onSave} title="Save (Ctrl+S)"><IcoSave/></button>
              <button className="toolbar-btn" onClick={onExportPdf} title="Export PDF"><IcoPdf/></button>
              <button className="toolbar-btn" onClick={onPrint}     title="Print (Ctrl+P)"><IcoPrint/></button>
            </Group>

            <Group label="History">
              <button className="toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)"><IcoUndo/></button>
              <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Y)"><IcoRedo/></button>
            </Group>

            <Group label="Font">
              <button className={`toolbar-btn${isBold        ? ' active' : ''}`} onClick={toggleBold}        title="Bold (Ctrl+B)">    <span className="lbl-bold">B</span></button>
              <button className={`toolbar-btn${isItalic      ? ' active' : ''}`} onClick={toggleItalic}      title="Italic (Ctrl+I)">    <span className="lbl-italic">I</span></button>
              <button className={`toolbar-btn${isStrike      ? ' active' : ''}`} onClick={toggleStrike}      title="Strikethrough">             <span className="lbl-strike">S</span></button>
              <button className={`toolbar-btn${isCode        ? ' active' : ''}`} onClick={toggleCode}        title="Inline code">       <span className="code-mono">&lt;/&gt;</span></button>
              <button className={`toolbar-btn${isHighlight   ? ' active' : ''}`} onClick={toggleHighlight}   title="Highlight text">       <span className="highlight-badge">H</span></button>
              <button className={`toolbar-btn${isSuperscript ? ' active' : ''}`} onClick={toggleSuperscript} title="Superscript">X<sup className="btn-sup">²</sup></button>
              <button className={`toolbar-btn${isSubscript   ? ' active' : ''}`} onClick={toggleSubscript}   title="Subscript">X<sub className="btn-sub">₂</sub></button>
            </Group>

            <Group label="Paragraph">
              <select
                className="heading-select"
                value={headingValue}
                onChange={(e) => setHeading(Number(e.target.value))}
                title="Heading style"
              >
                <option value="0">Normal</option>
                <option value="1">Heading 1</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
                <option value="4">Heading 4</option>
                <option value="5">Heading 5</option>
                <option value="6">Heading 6</option>
              </select>
              <button className={`toolbar-btn${alignLeft    ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()}    title="Align left"><IcoAlignL/></button>
              <button className={`toolbar-btn${alignCenter  ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()}  title="Center"><IcoAlignC/></button>
              <button className={`toolbar-btn${alignRight   ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()}   title="Align right"><IcoAlignR/></button>
              <button className={`toolbar-btn${alignJustify ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify"><IcoAlignJ/></button>
            </Group>

            <Group label="Lists">
              <button className={`toolbar-btn${isBulletList  ? ' active' : ''}`} onClick={toggleBulletList}  title="Bullet list"><IcoBullet/></button>
              <button className={`toolbar-btn${isOrderedList ? ' active' : ''}`} onClick={toggleOrderedList} title="Numbered list"><IcoOrdered/></button>
              <button className={`toolbar-btn${isTaskList    ? ' active' : ''}`} onClick={toggleTaskList}    title="Task list (checklist)"><IcoTask/></button>
            </Group>

            <Group label="Insert">
              <button className={`toolbar-btn${isBlockquote ? ' active' : ''}`} onClick={toggleBlockquote} title="Block quote"><IcoQuote/></button>
              <button className={`toolbar-btn${isCodeBlock  ? ' active' : ''}`} onClick={toggleCodeBlock}  title="Code block"><IcoCodeBlock/></button>
              <button className="toolbar-btn" onClick={setHorizontalRule} title="Horizontal rule"><IcoHr/></button>

              <div className="toolbar-popover-container">
                <button
                  className="toolbar-btn"
                  onClick={() => { setShowFootnotePopover(v => !v); setShowLinkPopover(false); setShowImagePopover(false); setShowIconPopover(false); }}
                  title="Insert footnote"
                >
                  <IcoFootnote/>
                </button>
                {showFootnotePopover && (
                  <div className="toolbar-popover">
                    <label>Footnote content</label>
                    <textarea
                      placeholder="Type the footnote text..."
                      value={footnoteText}
                      onChange={(e) => setFootnoteText(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <button
                      className="popover-btn"
                      onClick={addFootnote}
                      disabled={!footnoteText.trim()}
                    >
                      Insert
                    </button>
                  </div>
                )}
              </div>

              <div className="toolbar-popover-container">
                <button
                  className={`toolbar-btn${isLink ? ' active' : ''}`}
                  onClick={() => { setShowLinkPopover(v => !v); setShowImagePopover(false); setShowIconPopover(false); }}
                  title="Insert/edit link"
                >
                  <IcoLink/>
                </button>
                {showLinkPopover && (
                  <div className="toolbar-popover toolbar-popover--right">
                    <label>Link URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                      autoFocus
                    />
                    <div className="popover-row">
                      <button className="popover-btn" onClick={insertLink} disabled={!linkUrl}>Insert</button>
                      {isLink && (
                        <button className="popover-btn remove-btn" onClick={() => { removeLink(); setShowLinkPopover(false); }}>Remove</button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="toolbar-popover-container">
                <button
                  className="toolbar-btn"
                  onClick={() => { setShowImagePopover(v => !v); setShowLinkPopover(false); setShowIconPopover(false); }}
                  title="Insert image"
                >
                  <IcoImage/>
                </button>
                {showImagePopover && (
                  <div className="toolbar-popover toolbar-popover--right">
                    <label>Image URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      autoFocus
                    />
                    <label>Alt text</label>
                    <input
                      type="text"
                      placeholder="Image description"
                      value={imageAlt}
                      onChange={(e) => setImageAlt(e.target.value)}
                    />
                    <button className="popover-btn" onClick={insertImage} disabled={!imageUrl}>Insert</button>
                  </div>
                )}
              </div>

              <div className="toolbar-popover-container">
                <button
                  className="toolbar-btn"
                  onClick={() => { setShowIconPopover(v => !v); setShowLinkPopover(false); setShowImagePopover(false); setShowFootnotePopover(false); }}
                  title="Insert emoji / icon"
                >
                  <IcoSmile/>
                </button>
                {showIconPopover && (
                  <div className="toolbar-popover toolbar-popover--right toolbar-popover--icons">
                    <div className="icon-cat-row">
                      {EMOJI_CATS.map((cat, i) => (
                        <button
                          key={i}
                          className={`icon-cat-btn${iconCat === i ? ' active' : ''}`}
                          onClick={() => setIconCat(i)}
                          title={cat.title}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    <div className="icon-grid">
                      {(EMOJI_CATS[iconCat]?.emojis ?? []).map((emoji, i) => (
                        <button
                          key={i}
                          className="icon-btn"
                          onClick={() => insertIcon(emoji)}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Group>

          </>}

          {/* ── TABLES ──────────────────────────────────────────────────── */}
          {activeTab === 'tables' && <>

            <Group label="Table">
              <button className="toolbar-btn" onClick={insertTable} title="Insert new table (3×3)"><IcoTableNew/> <span className="btn-label-sm">Insert</span></button>
            </Group>

            <Group label="Rows">
              <button className="toolbar-btn" onClick={addTableRow}    disabled={!canAddRow} title="Add row below"><IcoRowAdd/></button>
              <button className="toolbar-btn" onClick={deleteTableRow}                        title="Delete selected row"><IcoRowDel/></button>
            </Group>

            <Group label="Columns">
              <button className="toolbar-btn" onClick={addTableCol}    disabled={!canAddCol} title="Add column to the right"><IcoColAdd/></button>
              <button className="toolbar-btn" onClick={deleteTableCol}                        title="Delete selected column"><IcoColDel/></button>
            </Group>

            <Group label="Cells">
              <button className="toolbar-btn" onClick={() => editor.chain().focus().toggleHeaderCell().run()} title="Toggle cell as header"><IcoHeaderCell/></button>
            </Group>

            <Group label="Structure">
              <button className="toolbar-btn" onClick={() => editor.chain().focus().toggleHeaderRow().run()}    title="Toggle header row"><IcoHeaderRow/></button>
              <button className="toolbar-btn" onClick={() => editor.chain().focus().toggleHeaderColumn().run()} title="Toggle header column"><IcoHeaderCol/></button>
            </Group>

            <Group label="Alignment">
              <button className={`toolbar-btn${alignLeft    ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()}    title="Align content left"><IcoAlignL/></button>
              <button className={`toolbar-btn${alignCenter  ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()}  title="Center content"><IcoAlignC/></button>
              <button className={`toolbar-btn${alignRight   ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()}   title="Align content right"><IcoAlignR/></button>
              <button className={`toolbar-btn${alignJustify ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify content"><IcoAlignJ/></button>
            </Group>

            <Group label="Maintenance">
              <button className="toolbar-btn" onClick={() => editor.chain().focus().fixTables().run()} title="Fix table structure"><IcoWrench/></button>
              <button className="toolbar-btn btn-danger" onClick={deleteTable} title="Delete entire table"><IcoTrash/></button>
            </Group>

          </>}

          {/* ── READING ─────────────────────────────────────────────────── */}
          {activeTab === 'reading' && <>

            <Group label="File">
              <button className="toolbar-btn" onClick={onOpen} title="Open (Ctrl+O)"><IcoOpen/></button>
              <button className={`toolbar-btn${showToc ? ' active' : ''}`} onClick={onToggleToc} title="Table of contents"><IcoToc/></button>
              <button className="toolbar-btn" onClick={onPrint} title="Print (Ctrl+P)"><IcoPrint/></button>
            </Group>

            <Group label="Export">
              <button className="toolbar-btn" onClick={onExportPdf}  title="Export PDF"><IcoPdf/> <span className="btn-label-sm">PDF</span></button>
              <button className="toolbar-btn" onClick={onExportHtml} title="Export HTML"><IcoFileOut/> <span className="btn-label-sm">HTML</span></button>
              <button className="toolbar-btn" onClick={onExportDocx} title="Export Word (.docx)"><IcoFileOut/> <span className="btn-label-sm">DOCX</span></button>
            </Group>

          </>}

        </div>

        {/* Right side: always visible */}
        <div className="toolbar-ribbon-right">
          {activeTab !== 'reading' && (
            <button
              className={`toolbar-btn toggle-btn${isMarkdownMode ? ' active' : ''}`}
              onClick={onToggleMode}
              title="Toggle between Visual Editor and Markdown Source"
            >
              {isMarkdownMode ? '👁 Visual' : '📝 Markdown'}
            </button>
          )}
          <button
            className="toolbar-btn"
            onClick={onToggleTheme}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <IcoSun/> : <IcoMoon/>}
          </button>
        </div>
      </div>

    </div>
  );
});

export default Toolbar;
