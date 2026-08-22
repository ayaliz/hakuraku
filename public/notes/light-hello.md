# Light Hello proc rates and Specialty Priority

I set out to measure Light Hello's `Another Day's Hard Work!` post-training event in Grand Live. Logging the facilities on every turn to do that also produced enough placement data to take another look at Specialty Priority, so this note covers both.

This data covers `10190` eligible trainings with Light Hello across `479` runs. For the sake of automating the test setup with little effort, these runs were with Haru Urara, ending on turn 37 by failing the first career goal, and never interacting with the song shop at all. Three runs were manually stopped before turn 37 to make setup changes.

For Light Hello's event data, up to two trainings per run are left out of that count: the first one shared with Hello, since that always plays her fixed intro event instead of being able to proc the event, and whichever one falls on the run's last turn, where in this setup the career ends before the event resolves. 

The placement data covers 8 distinct cards from `0` to very high Specialty Priority: 2LB R Maruzensky, 2LB R Biko Pegasus, 0LB SR Narita Taishin, 0LB R Gold City, 0LB SR Eishin Flash, 0LB SR Sweep Tosho, MLB SSR Kitasan Black, and MLB SSR Light Hello herself.

For the tests below, a high p-value means the data does not provide strong evidence against the hypothesis being tested, a low one indicates the gap is hard to write off as sampling noise.

## Where the widely cited 45% came from

The commonly circulated `45%` seems to trace back to testing done while Grand Live was current on JP.

[ルル's first test](https://www.youtube.com/watch?v=Tvow3X09I1c) got `238 / 514 = 46.30%`, which rounds naturally to about 45%. [A second test](https://www.youtube.com/watch?v=U0MI2nhDmog) got `201 / 523 = 38.43%`.

Those two samples don't fit together particularly well.

```text
p_pooled = (238 + 201) / (514 + 523) = 439 / 1037 = 0.42334
SE       = sqrt(0.42334 * 0.57666 * (1/514 + 1/523)) = 0.03069
z        = (0.46304 - 0.38432) / 0.03069 = 2.565
```

That is `p = 0.0103` two-sided, so a gap this large should turn up about 1% of the time if both tests measured the same event.

There may have been some procedural difference between the two, or the first run may just have been lucky.

## Our results

Our result is `4068 / 10190 = 39.92%`, with a 95% confidence interval of `38.97% - 40.88%`. 45% is well outside anything this sample supports.

Her event proc rate did not appear to depend meaningfully on her current bond, the facility being trained, or other post-training events. Proc rates by bond buckets (<60, 60–79, 80–99, 100+) ranged from 39.27% to 42.57% (p = 0.234), with no remaining bond difference after accounting for turn (p = 0.942). There was likewise no detectable difference between facilities (p = 0.938) or according to whether another post-training event occurred (p = 0.437).

## Light Hello is missing from the board a fifth of the time

The placement logs turned up something I've seen little discussion of: Light Hello is absent from all five facilities on about one in five turns.

In total, she was absent on `3114` of `15259` turns, or `20.41%`, with a 95% interval of `19.78% - 21.05%`.

The only mention of the general mechanic I could find is a note on the [ｽｯﾍﾟﾝﾍﾟﾝ Wiki's support card compilation](https://wikiwiki.jp/sppenpen/%E6%80%AA%E6%96%87%E6%9B%B8%E3%81%BE%E3%81%A8%E3%82%81), which puts ordinary supports at `7-9%` absence and Friend / non-Passion Zone Group supports at around `17%`.

## Where the Specialty Priority formula came from

The circulated formula comes from community testing early in the game's life, not from datamining.

On April 19, 2021, ゆんぼ posted [placement results for six support cards](https://x.com/JungerCH/status/1383999133812281349/) with `1327` observations each. Two days later Reinohit published [「得意率とトレーニング配置率に関する考察」](https://reinohit.hatenablog.com/entry/2021/04/21/080000) using that dataset. The post picks out three patterns: absence happened about half as often as being on any ordinary facility, raising Specialty Priority lowered every competing rate including absence, and a zero-priority support looked uniform across the five facilities.

Reinohit connected this to Granblue Fantasy's hostility system, where targets are picked by relative weight, and proposed weights of `100:100:100:100:100:50` for Speed / Stamina / Power / Guts / Wit / absent. That gives `100/550 = 18.18%` per facility and `50/550 = 9.09%` absence, with Specialty Priority raising the preferred facility's weight.

On April 26 ゆんぼ also released [a video analysing the same 1327 × 6 observations](https://www.youtube.com/watch?v=yXhhifZg9MA), crediting [@o_TeT_o](https://x.com/o_TeT_o) for the model, which was largely identical to Reinohit's.

The part that matters here is that `100 / 100 / 100 / 100 / 100 / 50` is an empirical community model built from observed rates plus a mechanic borrowed from another Cygames title.

## Our placement results

The thing to test is a weighted draw over six outcomes: the card's specialty facility at weight `W`, each of the other four facilities at `100`, and absence at `A`.

For ordinary Specialty Priority `S`, that gives `W = 100 + S`. The priorities represented here are Narita Taishin `0`, Gold City `0`, Eishin Flash `20`, Maruzensky `30`, Biko Pegasus `30`, Sweep Tosho `35`, and Kitasan Black `80`.

Kitasan is unusual because she also has `20` Specialty Priority from her unique bonus. The analysis below therefore leaves her out and treats her separately.

Every fit in the following sections uses turns 1-24 only, before the Grand Live debut Specialty Priority song takes effect.

### The absence weight of 50 does not hold up

This part uses the six ordinary supports only.

A zero-priority support reads `A` off directly. Its weights are `100:100:100:100:100:A`, so absence and facility placements are in the ratio `A : 500`:

```text
A = 500 * absent / (all five facility placements)
```

Fitting one shared `A` across all six ordinary supports gives `54.41`, with a 95% profile interval of `52.70 - 56.17`. A round value of `55` is therefore a good description of these data, while the historical value of `50` falls outside that interval.

Against the full six-outcome distribution:

| Model | Goodness of fit |
| --- | ---: |
| `A = 55` | `p = 0.530` |
| Historical `A = 50` | `p = 0.0032` |

The same pattern appears card by card:

| Card | Priority | `W` | `A = 50` | `A = 55` | Observed | Turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Narita Taishin | 0 | 100 | 9.09% | 9.91% | 9.37% | 6755 |
| Gold City | 0 | 100 | 9.09% | 9.91% | 9.99% | 6755 |
| Eishin Flash | 20 | 120 | 8.77% | 9.57% | 9.31% | 10987 |
| Maruzensky | 30 | 130 | 8.62% | 9.40% | 9.74% | 4232 |
| Biko Pegasus | 30 | 130 | 8.62% | 9.40% | 9.03% | 4232 |
| Sweep Tosho | 35 | 135 | 8.55% | 9.32% | 9.50% | 10987 |

Pooled, those cards are absent on `4169 / 43948 = 9.486%` of turns, with a 95% interval of `9.216% - 9.764%`. `A = 55` predicts a weighted average of `9.579%`; `A = 50` predicts `8.79%`.

So a useful working model for ordinary supports is:

- `P(specialty) = W / (W + 455)`
- `P(each other facility) = 100 / (W + 455)`
- `P(absent) = 55 / (W + 455)`

### Kitasan Black does not fit the ordinary picture cleanly

Kitasan Black provides a high speciality priority data point, but she also introduces a complication the other cards do not have: `20` Specialty Priority from her unique bonus.

She is absent on `964 / 10987 = 8.774%` of turns, with a 95% interval of `8.259% - 9.318%`.

Her ordinary Specialty Priority is `80`, and assuming a multiplicative reading of her unique bonus:

```text
W = (100 + 80) × 1.20 = 216
```

With `A = 55`, that model predicts:

```text
P(absent) = 55 / (216 + 455) = 8.20%
```

The observed `8.774%` is somewhat higher than predicted (`z = +2.21`, `p = 0.027`).

For comparison, the historical `A = 50` model predicts only `7.51%`, which misses much more strongly (`z = +5.04`, `p = 4.7e-7`). Kitasan therefore reinforces the evidence against `A = 50`, but she is also the only card for which `A = 55` is also potentially dubious.

It does not appear that her unique bonus is simply inactive. Conditioning on Kitasan being on the board at all removes absence from the comparison. She appears on Speed in `3486 / 10023 = 34.78%` of those turns:

| Model | Her `W` | Expected Speed share | p |
| --- | ---: | ---: | ---: |
| Additive, `100 + 80 + 20` | 200 | 33.33% | `0.0021` |
| Multiplicative, `(100 + 80) × 1.20` | 216 | 35.06% | `0.550` |

Her facility split therefore fits the multiplicative interpretation of the unique bonus very well. The tension is specifically that the same effective `W = 216` predicts slightly less absence than we observed.

I don't think one card is enough to turn that discrepancy into a new placement model. A `p = 0.027` result is unusual, but not extraordinary in a set of related tests, and Kitasan is the only card here with a unique Specialty Priority bonus.

## Where Light Hello fits

With an approximate placement model for ordinary supports, Light Hello's `20.41%` absence rate has something to compare against.

She showed no meaningful facility preference. Her absence can then be expressed as an equivalent weight `A_H` against a facility total of `500`:

```text
P(absent) = A_H / (500 + A_H)

A_H = 500 * P(absent) / (1 - P(absent))
    = 500 * 0.2041 / 0.7959
    = 128
```

Her 95% absence interval of `19.78% - 21.05%` corresponds to `A_H` between about `123` and `133`.

So, in the same units where ordinary supports sit near `55`, Light Hello behaves roughly like:

```text
100 : 100 : 100 : 100 : 100 : 128
```

## Public data

A copy of the data used for this analysis is available below. It contains the Light Hello proc observations and the aggregate facility-placement counts used for the Specialty Priority analysis.

A few notes for reproducing the results:

- Light Hello cannot appear on turns 1–4.
- Her first training always plays the fixed intro event, so those trainings are not included in the proc data.
- Completed runs ended on turn 37 before post-training events resolved due to failing Haru’s first career goal. Those turn-37 rows are retained but marked proc_eligible: false.
- A total of 3 runs in the dataset were manually stopped and deleted prior to turn 37 to make modifications like deck changes

Filtering to `proc_eligible: true` gives the `4068 / 10190 = 39.92%` proc rate reported above.

[Download the Light Hello dataset](attachments/light_hello_public_dataset.zip)