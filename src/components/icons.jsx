// Line icons, written by hand.
//
// Emoji looked different on every device and gave the app the air of a game.
// This is one set, one stroke width, and it takes the colour of the text around
// it.

const Svg = ({ size = 22, paths, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {paths}
  </svg>
);

export const Icon = ({ name, size = 22, ...rest }) => {
  const paths = PATHS[name];
  if (!paths) return null;
  return <Svg size={size} paths={paths} {...rest} />;
};

const PATHS = {
  // tab bar
  overview: (
    <>
      <path d="M5 3.5h11.5L19 6v14.5H5z" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  expenses: (
    <>
      <path d="M4 8.5h13l-2.5-3M20 15.5H7l2.5 3" />
    </>
  ),
  settle: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="16" cy="16" r="3.2" />
      <path d="M11.2 8H18M6 16h6.8" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6M17.5 14.8c2 .6 3.5 2.4 3.5 4.7" />
    </>
  ),
  more: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),

  // actions
  plus: <path d="M12 5.5v13M5.5 12h13" strokeWidth="2" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  right: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  arrow: <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l4.5 4.5" />
    </>
  ),
  download: <path d="M12 4.5v13M6.5 12L12 17.5 17.5 12M5 20h14" />,
  paste: (
    <>
      <path d="M9 4.5h6v3H9z" />
      <path d="M9 6H6.5v13.5h11V6H15" />
      <path d="M9.5 11h5M9.5 14.5h5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H20M17 12v3M20 12v2.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  empty: (
    <>
      <path d="M4 8.5h16v11H4z" />
      <path d="M4 8.5L7 4h10l3 4.5M12 4v4.5" />
    </>
  ),
};

export default Icon;
