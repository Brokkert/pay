// Small words that have to agree with a number.
//
// Writing "1 posten" is the kind of thing nobody reports and everybody notices,
// and a ternary at each call site is one more place to forget.

/** "1 post", "3 posten". */
export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
