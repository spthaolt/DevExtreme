"use strict";

var escapeRegExp = require("../../core/utils/common").escapeRegExp;

var DEFAULT_CONFIG = { thousandsSeparator: ",", decimalSeparator: "." },
    ESCAPING_CHAR = "'",
    MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || Math.pow(2, 53) - 1;

function getGroupSizes(formatString) {
    return formatString.split(",").slice(1).map(function(str) {
        return str.split("").filter(function(char) {
            return char === "#" || char === "0";
        }).length;
    });
}

function getIntegerPartRegExp(formatString, thousandsSeparator) {
    var result = escapeRegExp(formatString);
    result = result.replace(new RegExp("([0#,]+)"), "($1)");

    var groupSizes = getGroupSizes(formatString);

    result = result.replace(/0/g, "\\d");

    if(formatString.indexOf("#,") >= 0 && groupSizes.length) {
        result = result.replace(new RegExp("[#,]+"), "([" + thousandsSeparator + "]*[1-9][\\d\\" + thousandsSeparator + "]*)?");
    } else {
        result = result.replace(/#+/g, "([1-9]\\d*)?");
    }
    return result;
}

function getFloatPartRegExp(formatString, decimalSeparator) {
    if(!formatString) return "()";

    var result = escapeRegExp(decimalSeparator + formatString);
    result = result.replace(new RegExp("^(" + escapeRegExp(escapeRegExp(decimalSeparator)) + "0[0#]*)"), "($1)");
    result = result.replace(new RegExp("^(" + escapeRegExp(escapeRegExp(decimalSeparator)) + "[0#]*)"), "($1)?");
    result = result.replace(/0/g, "\\d");
    result = result.replace(/#/g, "\\d?");
    return result;
}

function getRegExp(config, formatString) {
    var floatParts = formatString.split("."),
        integerRegexp = getIntegerPartRegExp(floatParts[0], config.thousandsSeparator),
        floatRegExp = getFloatPartRegExp(floatParts[1], config.decimalSeparator);

    return integerRegexp + floatRegExp;
}

function getSignParts(format) {
    var signParts = format.split(";");

    if(signParts.length === 1) {
        signParts.push("-" + signParts[0]);
    }

    return signParts;
}

function checkParserArguments(format, text) {
    return format && text && typeof format === "string" && typeof text === "string";
}

function isPercentFormat(format) {
    return format.slice(-1) === "%";
}

function getParser(format, config) {
    config = config || DEFAULT_CONFIG;

    return function(text) {
        if(!checkParserArguments(format, text)) {
            return;
        }

        var signParts = getSignParts(format),
            regExpText = signParts.map(getRegExp.bind(null, config)).join("|"),
            parseResult = new RegExp("^(" + regExpText + ")$").exec(text);

        if(!parseResult) {
            return;
        }

        var signPartResultCount = parseResult.length / 2 - 1,
            isNegative = parseResult[signPartResultCount + 2],
            integerResultIndex = isNegative ? signPartResultCount + 2 : 2,
            floatResultIndex = integerResultIndex + signPartResultCount - 1,
            integerPart = parseResult[integerResultIndex].replace(new RegExp(escapeRegExp(config.thousandsSeparator), "g"), ""),
            floatPart = parseResult[floatResultIndex];

        var value = parseInt(integerPart) || 0;

        if(value > MAX_SAFE_INTEGER) {
            return;
        }

        if(floatPart) {
            value += parseFloat(floatPart.replace(config.decimalSeparator, ".")) || 0;
        }

        if(isNegative) {
            value = -value;
        }

        if(isPercentFormat(format)) {
            value = value / 100;
        }

        return value;
    };
}

function reverseString(str) {
    return str.toString().split("").reverse().join("");
}

function isPercentFormat(format) {
    return format.indexOf("%") !== -1 && !format.match(/'[^']*%[^']*'/g);
}

function getNonRequiredDigitCount(floatFormat) {
    if(!floatFormat) return 0;
    return floatFormat.length - floatFormat.replace(/[#]/g, "").length;
}

function getRequiredDigitCount(floatFormat) {
    if(!floatFormat) return 0;
    return floatFormat.length - floatFormat.replace(/[0]/g, "").length;
}

function normalizeValueString(valuePart, minDigitCount, maxDigitCount) {
    if(!valuePart) return "";

    if(valuePart.length > maxDigitCount) {
        valuePart = valuePart.substr(0, maxDigitCount);
    }

    while(valuePart.length > minDigitCount && valuePart.slice(-1) === "0") {
        valuePart = valuePart.substr(0, valuePart.length - 1);
    }

    while(valuePart.length < minDigitCount) {
        valuePart += "0";
    }

    return valuePart;
}

function applyGroups(valueString, groupSizes, thousandsSeparator) {
    if(!groupSizes.length) return valueString;

    var groups = [],
        index = 0;

    while(valueString) {
        var groupSize = groupSizes[index];
        groups.push(valueString.slice(0, groupSize));
        valueString = valueString.slice(groupSize);
        if(index < groupSizes.length - 1) {
            index++;
        }
    }
    return groups.join(thousandsSeparator);
}

function formatNumberPart(format, valueString, minDigitCount, maxDigitCount) {
    return format.split(ESCAPING_CHAR).map(function(formatPart, escapeIndex) {
        var isEscape = escapeIndex % 2;
        if(!formatPart && isEscape) {
            return ESCAPING_CHAR;
        }
        return isEscape ? formatPart : formatPart.replace(/[,#0]+/, valueString);
    }).join("");
}

function getFormatter(format, config) {
    config = config || DEFAULT_CONFIG;

    return function(value) {
        if(typeof value !== "number" || isNaN(value)) return "";

        var signFormatParts = getSignParts(format),
            isPositiveZero = 1 / value === Infinity,
            isPositive = value > 0 || isPositiveZero,
            numberFormat = signFormatParts[isPositive ? 0 : 1];

        if(isPercentFormat(numberFormat)) {
            value = value * 100;
        }

        if(!isPositive) {
            value = -value;
        }

        var floatFormatParts = numberFormat.split("."),
            minFloatPrecision = getRequiredDigitCount(floatFormatParts[1]),
            maxFloatPrecision = minFloatPrecision + getNonRequiredDigitCount(floatFormatParts[1]),
            minIntegerPrecision = getRequiredDigitCount(floatFormatParts[0]),
            maxIntegerPrecision = getNonRequiredDigitCount(floatFormatParts[0]) ? undefined : minIntegerPrecision,
            groupSizes = getGroupSizes(floatFormatParts[0]).reverse();

        var valueParts = value.toFixed(maxFloatPrecision).split(".");

        var valueIntegerPart = normalizeValueString(reverseString(valueParts[0]), minIntegerPrecision, maxIntegerPrecision),
            valueFloatPart = normalizeValueString(valueParts[1], minFloatPrecision, maxFloatPrecision);

        valueIntegerPart = applyGroups(valueIntegerPart, groupSizes, config.thousandsSeparator);

        var integerString = reverseString(formatNumberPart(reverseString(floatFormatParts[0]), valueIntegerPart)),
            floatString = maxFloatPrecision ? formatNumberPart(floatFormatParts[1], valueFloatPart) : "";

        var result = integerString + (floatString.match(/\d/) ? config.decimalSeparator : "") + floatString;

        return result;
    };
}

function parseValue(text, isPercent, isNegative) {
    var value = (isPercent ? 0.01 : 1) * parseFloat(text) || 0;

    return isNegative ? -value : value;
}

function prepareValueText(valueText, formatter, isPercent, isIntegerPart) {
    var nextValueText = valueText,
        char,
        text,
        nextText;

    do {
        if(nextText) {
            char = text.length === nextText.length ? "0" : "1";
            valueText = isIntegerPart ? char + valueText : valueText + char;
        }
        text = nextText || formatter(parseValue(nextValueText, isPercent));
        nextValueText = isIntegerPart ? "1" + nextValueText : nextValueText + "1";
        nextText = formatter(parseValue(nextValueText, isPercent));
    } while(text !== nextText && (isIntegerPart ? text.length === nextText.length : text.length <= nextText.length));

    if(isIntegerPart && nextText.length > text.length) {
        var hasGroups = formatter(12345).indexOf("12345") === -1;
        do {
            valueText = "1" + valueText;
        } while(hasGroups && parseValue(valueText, isPercent) < 100000);
    }

    return valueText;
}

function getFormatByValueText(valueText, formatter, isPercent, isNegative) {
    var format = formatter(parseValue(valueText, isPercent, isNegative)),
        valueTextParts = valueText.split("."),
        valueTextWithModifiedFloat = valueTextParts[0] + ".3" + valueTextParts[1].slice(1),
        valueWithModifiedFloat = parseValue(valueTextWithModifiedFloat, isPercent, isNegative),
        decimalSeparatorIndex = formatter(valueWithModifiedFloat).indexOf("3") - 1;

    format = format.replace(/(\d)\D(\d)/g, "$1,$2");

    if(decimalSeparatorIndex >= 0) {
        format = format.slice(0, decimalSeparatorIndex) + "." + format.slice(decimalSeparatorIndex + 1);
    }

    format = format.replace(/1+/, "1").replace(/1/g, "#");

    if(!isPercent) {
        format = format.replace("%", "'%'");
    }

    return format;
}

function getFormat(formatter) {
    var valueText = ".",
        isPercent = formatter(1).indexOf("100") >= 0;

    valueText = prepareValueText(valueText, formatter, isPercent, true);
    valueText = prepareValueText(valueText, formatter, isPercent, false);

    var positiveFormat = getFormatByValueText(valueText, formatter, isPercent, false);
    var negativeFormat = getFormatByValueText(valueText, formatter, isPercent, true);

    return negativeFormat === "-" + positiveFormat ? positiveFormat : positiveFormat + ";" + negativeFormat;
}

exports.getParser = getParser;
exports.getFormatter = getFormatter;
exports.getFormat = getFormat;
