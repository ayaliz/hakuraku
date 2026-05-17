# Spot struggle duration and exit conditions

This note documents a small discrepancy I found while testing spot struggle. The short version is that the known speed and HP effects appear to work as expected, but the duration seems to be scaled by Front Runner aptitude. I also suspect that one of the constants previously documented as an Oonige-specific entry range is actually used as an exit condition.

## Baseline mechanics

The starting point is kuromiAK's [mechanics document](https://docs.google.com/document/d/15VzW9W2tXBBTibBRbZ8IVpW6HaMX8H0RP03kq6Az7Xg/edit?tab=t.0#heading=h.5l523bk8k3vz). As currently documented, spot struggle can trigger from 150 m after the start through section 6 when at least two Front Runners, or at least two Oonige, are close enough to each other. Normal Front Runners and Oonige do not compete with each other.

The documented entry checks are:

| Strategy type | Distance gap | Lane gap |
| --- | ---: | ---: |
| Front Runner | `< 3.75 m` | `< 0.165 * CourseWidth` |
| Oonige | `< 5.0 m` | `< 0.416 * CourseWidth` |

While spot struggle is active, the game adds target speed based on guts:

$$
\Delta v = (500 \cdot \operatorname{Guts})^{0.6} \cdot 0.0001
$$

and the documented duration is:

$$
t = (700 \cdot \operatorname{Guts})^{0.5} \cdot 0.012
$$

Spot struggle always ends once section 9 is reached, even if the duration has not expired.

The game parameter file contains the following constants for this mechanic:

```json
"CompeteTop": {
  "CheckStartDistance": 150.0,
  "CheckEndSection": 6,
  "EndSection": 9,
  "NigeCount": 1,
  "OonigeCount": 1,
  "DistanceGap1": 3.75,
  "LaneGap1": 0.165,
  "DistanceGap2": 5.0,
  "LaneGap2": 0.416,
  "TimeCoef1": 700.0,
  "TimeCoef2": 0.5,
  "TimeCoef3": 0.012,
  "AddParam1Coef1": 500.0,
  "AddParam1Coef2": 0.6,
  "AddParam1Coef3": 0.0001
}
```

The HP constants are also consistent with the documented values.

```json
"Hp": {
  "HpDecRateBaseCompeteTopNige": 1.4,
  "HpDecRateBaseTemptationAndCompeteTopNige": 3.6,
  "HpDecRateBaseCompeteTopOonige": 3.5,
  "HpDecRateBaseTemptationAndCompeteTopOonige": 7.7
}
```

## Test setup

All tests were run on Hanshin 3200 m turf in 9-uma practice rooms. One or two player characters were used at a time. Conditions were neutral mood, firm ground, and spring season.

The test characters were:

![Spot struggle test characters](attachments/strugglers.png)

On this course, the early-race target speed for Front Runners is:

$$
20.0 - \frac{3200 - 2000}{1000} = 18.8\text{ m/s}
$$

Before any other effects, wit rolls move that slightly. With the wit stats used in these tests, the expected target speed range is approximately:

$$
\left(1 + \frac{\frac{267}{5500}\log_{10}(267 \cdot 0.1) - 0.65}{100}\right) \cdot 18.8
= 18.69\text{ m/s}
$$

to

$$
\left(1 + \frac{\frac{283}{5500}\log_{10}(283 \cdot 0.1)}{100}\right) \cdot 18.8
= 18.814\text{ m/s}
$$

That gives the following useful speed bands for interpreting the replays:

| Observed speed | Likely state |
| ---: | --- |
| `18.69-18.814 m/s` | Neither spot struggle nor speed-up/overtake mode |
| `18.983-19.107 m/s` | Spot struggle only |
| `19.4376-19.7547 m/s` | Speed-up/overtake mode only |
| Above `19.7547 m/s` | Spot struggle plus speed-up/overtake mode |

The spot struggle speed gain at 1200 guts should be:

$$
(500 \cdot 1200)^{0.6} \cdot 0.0001 = 0.293\text{ m/s}
$$

The documented duration at 1200 guts should be:

$$
(700 \cdot 1200)^{0.5} \cdot 0.012 \approx 11\text{ s}
$$

## Aptitude appears to scale duration

The speed gain and base duration behave as expected for characters with Front Runner aptitude A. In this [Sei and Daiwa replay](https://hakuraku.moe/racedata?kv=QICn9X9GaXoOQJ3w1Fa3lkEy), spot struggle starts at `11.588 s`.

On the `22.38 s` race frame, both are still verifiably spot struggling:

| Character | Speed | Interpretation |
| --- | ---: | --- |
| Seiun Sky | `19.08 m/s` | Spot struggle only |
| Daiwa Scarlet | `19.97 m/s` | Spot struggle plus overtake mode |

By the `23.44 s` race frame, both have dropped back into non-spot-struggle speed ranges. That matches an approximately 11 second spot struggle starting at `11.588 s`.

The behavior changes for characters with poor Front Runner aptitude. In this [Special Week and Super Creek replay](https://hakuraku.moe/racedata?kv=U1p-T0S9q0BSr35PUoJUMYCC), spot struggle starts at `13.120 s`.

Special Week is already no longer spot struggling by the `14.92 s` race frame, with consecutive frames at `18.69 m/s`. Super Creek remains in spot struggle at the `19.14 s` frame with a speed of `19.94 m/s`, but by the `20.25 s` frame she has two consecutive frames at `19.65 m/s`. That is speed-up mode without spot struggle.

So the observed upper bounds are:

| Character | Front Runner aptitude | Observed spot struggle duration |
| --- | --- | ---: |
| Special Week | G | `< 1.8 s` |
| Super Creek | D | `< 7.13 s` |

This matches a claim made in ルル's [spot struggle video](https://www.youtube.com/watch?v=soQGIsFQLaI): spot struggle duration is multiplied by the strategy proficiency modifier. With Front Runner aptitude G and D, Special Week and Super Creek would be expected to fall to roughly `1.1 s` and `6.6 s` respectively, which fits the observations very well.

I was not able to produce any race where Special Week verifiably spot struggled for more than 2 seconds, or any race where Super Creek verifiably spot struggled for more than 7 seconds. Given that Front Runner aptitude is the main meaningful difference between the test characters, I think the aptitude-scaled duration is very likely real.

## There may be a distance-based exit condition

I also found cases where spot struggle ended early even for A-aptitude Front Runners:

- [Race 1](https://hakuraku.moe/racedata?kv=bh5nvx-S4bFLaerx0D2I4BjH): Sei starts spot struggling at `14.585 s`, but is already down to `18.78 m/s` by the `24.51 s` race frame.
- [Race 2](https://hakuraku.moe/racedata?kv=Fw8GBXFJpb3EYA6y-9rETyiE): Sei starts spot struggling at `12.854 s`, but is back down to `18.8 m/s` by the `19.18 s` race frame.

In both races, Sei gets more than 5 m ahead of the uma she started spot struggling with shortly before spot struggle ends.

That matters because the parameter file contains `DistanceGap2: 5.0`. The current documentation interprets this as the wider Oonige entry distance, compared to the `DistanceGap1: 3.75` entry distance for regular Front Runners. My suspicion is that `DistanceGap2` is instead, or at least also, used as a spot struggle exit distance.

## Oonige entry range does not look wider

To test whether Oonige really can start spot struggle from around 5 m away, I looked for races where two Suzukas approached each other from outside the normal Front Runner threshold:

- [Race 1](https://hakuraku.moe/racedata?kv=rIHfp8mGimuPeC90mYhy5QNx): On the `26.64 s` frame, the two Suzukas are `4.4 m` apart and do not start spot struggling. On the `27.71 s` frame, they are `3.1 m` apart. Spot struggle begins at `27.173 s`.
- [Race 2](https://hakuraku.moe/racedata?kv=JJANaXG1EMudcLheAGxV_uhp): On the `28.77 s` frame, the two Suzukas are `4.1 m` apart and do not start spot struggling. On the `29.84 s` frame, they are `3.3 m` apart. Spot struggle begins at `29.104 s`.

These replays do not support the idea that Oonige have a wider 5 m spot struggle entry range. They look much more consistent with the regular `DistanceGap1: 3.75` entry threshold.

## Conclusion

I believe two details are missing or mischaracterized in the current spot struggle documentation:

1. Spot struggle duration appears to be multiplied by Front Runner strategy proficiency, as proposed by ルル.
2. `DistanceGap2`, and likely `LaneGap2`, may be exit thresholds rather than Oonige-specific entry thresholds.

Under this interpretation, both normal Front Runners and Oonige use the same entry conditions, but spot struggle can end early if the competing umas move too far apart.
