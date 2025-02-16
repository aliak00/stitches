import { toCamelCase, toKebabCase } from '../../stringify/src/toCase.js'
import { stringify } from '../../stringify/src/index.js'
import unitOnlyProps from './unitOnlyProps.js'

/** Token matcher. */
const captureTokens = /([+-])?((?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)?(\$|--)([$\w-]+)/g

const splitBySpace = /\s+(?![^()]*\))/
const split = (fn) => (data) => fn(...(typeof data === 'string' ? String(data).split(splitBySpace) : [data]))

const mqunit = /([\d.]+)([^]*)/

const polys = {
	// prefixed properties
	appearance: (d) => ({ WebkitAppearance: d, appearance: d }),
	backfaceVisibility: (d) => ({ WebkitBackfaceVisibility: d, backfaceVisibility: d }),
	backgroundClip: (d) => ({ WebkitBackgroundClip: d, backgroundClip: d }),
	clipPath: (d) => ({ WebkitClipPath: d, clipPath: d }),
	content: (d) => ({ content: !/^([^]*["'][^]*|[A-Za-z]+\([^]*|[^]*-quote|inherit|initial|none|normal|revert|unset)$/.test(d) ? `"${d}"` : d }),
	hyphens: (d) => ({ WebkitHyphens: d, hyphens: d }),
	maskImage: (d) => ({ WebkitMaskImage: d, maskImage: d }),
	tabSize: (d) => ({ MozTabSize: d, tabSize: d }),
	userSelect: (d) => ({ WebkitUserSelect: d, userSelect: d }),

	// logical properties
	marginBlock: split((s, e) => ({ marginBlockStart: s, marginBlockEnd: e || s })),
	marginInline: split((s, e) => ({ marginInlineStart: s, marginInlineEnd: e || s })),
	maxSize: split((b, i) => ({ maxBlockSize: b, maxInlineSize: i || b })),
	minSize: split((b, i) => ({ minBlockSize: b, minInlineSize: i || b })),
	paddingBlock: split((s, e) => ({ paddingBlockStart: s, paddingBlockEnd: e || s })),
	paddingInline: split((s, e) => ({ paddingInlineStart: s, paddingInlineEnd: e || s })),
}

export const createStringify = (config) => {
	const { media, themeMap, utils } = config

	let lastPolyFunc
	let lastPolyData
	let lastUtilFunc
	let lastUtilData

	return (css) =>
		stringify(css, (name, data) => {
			const firstChar = name.charCodeAt(0)
			const camelName = firstChar === 64 ? name : toCamelCase(name)
			const kebabName = firstChar === 64 ? name : toKebabCase(name)

			// run utilities that match the raw left-hand of the CSS rule or declaration
			if (typeof utils[name] === 'function' && (utils[name] != lastUtilFunc || data != lastUtilData)) {
				lastUtilFunc = utils[name]
				lastUtilData = data

				return lastUtilFunc(config)(lastUtilData)
			}

			lastUtilData = data

			// run polyfills that match the camel-case-left hand of the CSS declaration
			if (typeof polys[camelName] === 'function' && (polys[camelName] != lastPolyFunc || data != lastPolyData)) {
				lastPolyFunc = polys[camelName]
				lastPolyData = data

				return lastPolyFunc(lastPolyData)
			}

			// prettier-ignore

			/** CSS left-hand side value, which may be a specially-formatted custom property. */
			let customName = (
				// prettier-ignore
				firstChar === 64
					? (
						name.slice(1) in media
							? '@media ' + media[name.slice(1)]
						: name
					).replace(/\(\s*([\w-]+)\s*(=|<|<=|>|>=)\s*([\w-]+)\s*(?:(<|<=|>|>=)\s*([\w-]+)\s*)?\)/g, (_, a, l, b, r, c) => {
						const isValueFirst = mqunit.test(a)
						const shift = 0.0625 * (isValueFirst ? -1 : 1)
						const [name, value] = isValueFirst ? [b, a] : [a, b]

						return (
							// prettier-ignore
							'(' +
								(
									l[0] === '=' ? '' : (l[0] === '>' === isValueFirst ? 'max-' : 'min-')
								) + name + ':' +
								(l[0] !== '=' && l.length === 1 ? value.replace(mqunit, (_, v, u) => Number(v) + shift * (l === '>' ? 1 : -1) + u) : value) +
								(
									r
										? ') and (' + (
											(r[0] === '>' ? 'min-' : 'max-') + name + ':' +
											(r.length === 1 ? c.replace(mqunit, (_, v, u) => Number(v) + shift * (r === '>' ? -1 : 1) + u) : c)
										)
									: ''
								) +
							')'
						)
					})
				: firstChar === 36
					? '-' + name.replace(/\$/g, '-')
				: name
			)

			// prettier-ignore

			/** CSS right-hand side value, which may be a specially-formatted custom property. */
			const customData = (
				// preserve object-like data
				data === Object(data)
					? data
				// replace specially-marked numeric property values with pixel versions
				: data && typeof data === 'number' && unitOnlyProps.test(kebabName)
					? String(data) + 'px'
				// replace tokens with stringified primitive values
				: String(data).replace(
					captureTokens,
					($0, direction, multiplier, separator, token) => (
						separator == "$" == !!multiplier
							? $0
						: (
							direction || separator == '--'
								? 'calc('
							: ''
						) + (
							'var(' + (
								separator === '$'
									? '--' + (
										!token.includes('$')
											? camelName in themeMap
												? themeMap[camelName] + '-'
											: ''
										: ''
									) + token.replace(/\$/g, '-')
								: separator + token
							) + ')' + (
								direction || separator == '--'
									? '*' + (
										direction || ''
									) + (
										multiplier || '1'
									) + ')'
								: ''
							)
						)
					),
				)
			)

			if (data != customData || kebabName != customName) {
				return {
					[customName]: customData,
				}
			}

			return null
		})
}
