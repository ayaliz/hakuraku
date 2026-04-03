# Spark generation rates

The baseline expectations used here come from crazyfellow's [parenting & gene guide](https://docs.google.com/document/d/1Q3IJKbtkplmuY-PAJMNjYiLtasv0eU0aIBEqp8_C3tg/). The observed data below comes from my current deduped CM10-CM12 room match data.

## Dataset

- Blue and pink spark analyses: 107,159 unique characters with rank score `>= 1000` (this will exclude the starting 5 G-F rank characters on the account in case anyone put those into rooms, since their sparks are static)
- White spark analyses:
  - 23,786 unique characters in the `>= 17500` band
  - 83,169 unique characters in the `6500 <= score < 17500` band
- The `1000 <= score < 6500` white band is intentionally omitted from interpretation because the sample is still too small

For the statistical checks, I used chi-squared goodness-of-fit tests. High p-values mean the observed counts are comfortably in line with the null model; low p-values mean the deviations are probably too large to explain by random sampling alone.

## Blue spark type

Hypothesis: the five blue spark types are equally likely.

| Type | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| Speed | 21,809 | 20.35% | 20.00% | +0.35% |
| Stamina | 21,269 | 19.85% | 20.00% | -0.15% |
| Power | 21,776 | 20.32% | 20.00% | +0.32% |
| Guts | 21,016 | 19.61% | 20.00% | -0.39% |
| Wit | 21,289 | 19.87% | 20.00% | -0.13% |

Result: `p = 0.000165`

Interpretation: Blue types are very close to a 20/20/20/20/20 split in absolute terms, but with this many samples the remaining deviation is still statistically significant. The main pattern is a small excess of Speed and Power, and a small deficit of Guts, so the pure equal-distribution hypothesis is not a good match for the current data.

What is interesting is that the ordering lines up with the stat distribution of the same dataset. The average five-stat mix of these CM10-CM12 characters is roughly:

- Speed: `26.96%`
- Power: `22.37%`
- Stamina: `19.27%`
- Wit: `19.04%`
- Guts: `12.36%`

The stat distribution is much more extreme than the blue spark rates, but it points in the same direction: the stats that occupy more of a character's statline tend to be slightly overrepresented in blue sparks, while Guts is both the smallest average share and the least common blue spark.

I also checked whether this could be explained by lineage, by comparing a character's blue spark to the blue spark makeup of its six entries in `succession_chara_array`. No meaningful correlation was found - simply having more Speed, Power, or other blue sparks in the immediate lineage did not seem to make the matching child blue spark materially more likely.

This interpretation also lines up with older URA-era data from Umamusu Station's [blue factor analysis](https://umamusustation.com/blue_factor_analysis.html). In its 22411 uma data from `2021-05-04`, the reported blue spark rates were approximately Speed `20.13%`, Stamina `20.33%`, Power `20.36%`, Guts `19.42%`, and Wit `19.76%`. Guts was again the clear low point, followed by wit, which is in line with common uma statlines seen during URA, when this data was recorded.

Bottom line: The current equal distribution hypothesis is slightly but meaningfully off. Blue spark type is probably weighted a little toward stronger stats in some fashion, though the exact mechanism is unclear. I may revisit this after the dataset grows even more with future CMs.

## Blue spark star count

Hypothesis: star rates depend on the corresponding stat value:

- Below `600`: 90% 1-star, 10% 2-star, 0% 3-star
- `600` to `1099`: 50% 1-star, 45% 2-star, 5% 3-star
- `>= 1100`: 20% 1-star, 70% 2-star, 10% 3-star

### Corresponding stat below `600`

| Stars | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| 1 star | 20,507 | 89.70% | 90.00% | -0.30% |
| 2 star | 2,356 | 10.30% | 10.00% | +0.30% |
| 3 star | 0 | 0.00% | 0.00% | +0.00% |

Result: `p = 0.124405`

Interpretation: This band looks broadly consistent with the community expectation.

### Corresponding stat `600 <= value < 1100`

| Stars | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| 1 star | 27,248 | 49.47% | 50.00% | -0.53% |
| 2 star | 24,921 | 45.24% | 45.00% | +0.24% |
| 3 star | 2,912 | 5.29% | 5.00% | +0.29% |

Result: `p = 0.001584`

Interpretation: This is a clear mismatch under the original community rates. The absolute gaps are still small, but with this sample size the slight excess of 2-star and 3-star blues is large enough to show up clearly. The underlying rates may be subtly different than previous believed.

### Corresponding stat `>= 1100`

| Stars | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| 1 star | 5,740 | 19.65% | 20.00% | -0.35% |
| 2 star | 20,427 | 69.92% | 70.00% | -0.08% |
| 3 star | 3,048 | 10.43% | 10.00% | +0.43% |

Result: `p = 0.025731`

Interpretation: The top band is also a little off under the original `20/70/10` expectation, mainly because 3-star blues are slightly more common than expected. The absolute gap is still small, but with this sample size it is large enough to register.

## Pink spark type

Hypothesis: Each character rolls uniformly among all aptitudes with rank `A` or `S`.

| Type | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| Turf | 19,461 | 18.16% | 18.11% | +0.05% |
| Dirt | 6,783 | 6.33% | 6.29% | +0.04% |
| Front Runner | 8,150 | 7.61% | 7.72% | -0.11% |
| Pace Chaser | 9,938 | 9.27% | 9.30% | -0.03% |
| Late Surger | 8,583 | 8.01% | 8.05% | -0.04% |
| End Closer | 5,261 | 4.91% | 4.97% | -0.06% |
| Sprint | 1,788 | 1.67% | 1.68% | -0.01% |
| Mile | 15,615 | 14.57% | 14.53% | +0.04% |
| Medium | 17,925 | 16.73% | 16.84% | -0.11% |
| Long | 13,655 | 12.74% | 12.50% | +0.24% |

Result: `p = 0.391335`

Interpretation: Pink type generation looks fully consistent with the existing hypothesis. Long is a bit high and Front Runner is a bit low, but the overall fit is good.

## Pink spark star count

Hypothesis: Pink stars are fixed at 20% 1-star, 70% 2-star, 10% 3-star.

| Stars | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| 1 star | 21,414 | 19.98% | 20.00% | -0.02% |
| 2 star | 75,103 | 70.09% | 70.00% | +0.09% |
| 3 star | 10,642 | 9.93% | 10.00% | -0.07% |

Result: `p = 0.727413`

Interpretation: Pink star generation matches the expected rates very well.

## White skill spark generation

Community hypothesis:

- White circle: `20% + 2.5% * lineage_count`
- Double circle: `25% + 2.5% * lineage_count`
- Gold: `40% + 5% * lineage_count`

For plain white skills:

| Lineage | Samples | Observed % | Community expectation |
| --- | ---: | ---: | ---: |
| 0 | 511,839 | 20.08% | 20.00% |
| 1 | 187,420 | 21.82% | 22.50% |
| 2 | 69,808 | 24.15% | 25.00% |
| 3 | 28,538 | 26.64% | 27.50% |
| 4 | 11,836 | 29.26% | 30.00% |
| 5 | 5,227 | 32.98% | 32.50% |
| 6+ | 1,640 | 34.33% | 35.00% |

Result: `p = 3.6317164587496 × 10^-14`

For double circle skills:

| Lineage | Samples | Observed % | Community expectation |
| --- | ---: | ---: | ---: |
| 0 | 51,663 | 24.92% | 25.00% |
| 1 | 18,416 | 27.56% | 27.50% |
| 2 | 4,922 | 30.05% | 30.00% |
| 3 | 1,072 | 34.33% | 32.50% |
| 4 | 196 | 38.78% | 35.00% |
| 5 | 26 | 42.31% | 37.50% |

Result: `p = 0.985423360366759`

For gold skills:

| Lineage | Samples | Observed % | Community expectation |
| --- | ---: | ---: | ---: |
| 0 | 168,666 | 39.96% | 40.00% |
| 1 | 83,937 | 43.95% | 45.00% |
| 2 | 48,184 | 48.29% | 50.00% |
| 3 | 24,228 | 53.74% | 55.00% |
| 4 | 8,796 | 58.34% | 60.00% |
| 5 | 2,096 | 65.31% | 65.00% |
| 6+ | 290 | 69.66% | 70.00% |

Result: `p = 3.08625316723481 × 10^-19`

The largest mismatch is in the `1` and `2` lineage buckets, which carry a lot of weight due to the high sample size. The base rates look broadly fine, but the first couple of lineage copies do not appear to add as much as the community formula says they should.

### Plausible replacements

I first tried to rescue the community idea with simple linear fits. That did improve the white and gold curves compared to the original `+2.5%` and `+5%` lineage boosts, but it did not produce a convincing end result. The best fixed-base linear fits were roughly:

- White circle: `20% + 2.168% * lineage_count`
- Gold: `40% + 4.432% * lineage_count`

Those are much better approximations than the old community formula, but they still leave low p-values:

- White fixed-base linear fit: `p = 0.002964`
- Gold fixed-base linear fit: `p = 0.010490`

That matters because the problem is not just that the community boosts per lineage were slightly too large overall. The shape of the error is systematic: the predictions for having `1` or `2` sparks in the lineage are too high, while the higher-lineage buckets are closer. In other words, a linear boost per spark in the lineage does not seem to describe the data especially naturally.

After testing a range of simple nonlinear models, the cleanest empirical replacements were piecewise-at-2 rules:

- White: `20%`, then `+2%` for copies `1-2`, then `+2.75%` for copies after that
- Double circle: `25%`, then `+2.5%` for copies `1-2`, then `+3.4375%` for copies after that
- Gold: `40%`, then `+4%` for copies `1-2`, then `+5.5%` for copies after that

Those piecewise models fit the dataset very well, but they should still be treated as descriptive fits rather than confirmed in-game formulas:

- White piecewise-at-2 variant: `p = 0.794791256430539`
- Double circle piecewise-at-2 variant: `p = 0.999960866125893`
- Gold piecewise-at-2 variant: `p = 0.983140492227282`

This behavior of white sparks was also previously observed by aoneko_pochi in 2024, see https://x.com/aoneko_pochi/status/1762370579603304731/.
He proposed that white spark generation follows `base_rate * 1.1^(lineage_count)`, which is also a good fit for my data (`p >= 0.84` for all three categories), which is also an elegant solution here.

## White spark star count

### Rank score `>= 17500`

Hypothesis: 20% 1-star, 70% 2-star, 10% 3-star.

| Stars | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| 1 star | 39,233 | 19.95% | 20.00% | -0.05% |
| 2 star | 137,675 | 70.01% | 70.00% | +0.01% |
| 3 star | 19,738 | 10.04% | 10.00% | +0.04% |

Result: `p = 0.773733`

Interpretation: The high-score white spark rates are extremely well aligned with the expected `20/70/10` model.

### Rank score `6500 <= score < 17500`

Hypothesis: 50% 1-star, 45% 2-star, 5% 3-star.

| Stars | Observed | Observed % | Expected % | Difference |
| --- | ---: | ---: | ---: | ---: |
| 1 star | 264,997 | 50.13% | 50.00% | +0.13% |
| 2 star | 237,399 | 44.91% | 45.00% | -0.09% |
| 3 star | 26,241 | 4.96% | 5.00% | -0.04% |

Result: `p = 0.127494`

Interpretation: The mid-score white spark rates also look consistent with the expected model. The fit is slightly less perfect than in the top band, but still well within normal sampling variation.

## Bottom line

- Pink spark type generation looks good.
- Pink star generation looks good.
- White skill factor generation looks directionally consistent with the community understanding, but linear lineage boosts aren't a good fit. A piecewise rule with smaller boosts at lineage `1-2` fits much better.
- White spark stars look good in both usable score bands.
- Blue spark generation is one place where we can see a small but statistically real mismatch. Blue star odds are very close to the community expectations, but blue type odds are a worse fit to the equal-distribution expectation and look more consistent with a mild weighting toward higher stats.
