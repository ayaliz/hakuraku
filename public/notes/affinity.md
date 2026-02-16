# SingleModeUtils.CalcRelationPoint

This function is in charge of calculating the total affinity of your parents/grandparents to decide whether to display triangle, circle or double circle affinity.

## Race bonus

Base affinity is well understood, so I won't be talking about it here.

To derive the race bonus affinity from a parent + a grandparent pair, the game looks at their win_saddle_id_array. It'll look something like this:

```
Parent:        [1, 2, 5, 10, 11, 12, 13, 15, 16, 17, 18, 23, 25, 26, 27, 34, 63, 145, 146, 147]
Grandparent 1:  [4, 5, 6, 10, 13, 14, 15, 17, 23, 26, 27, 61, 122, 130]
Grandparent 2:  [2, 6, 7, 10, 11, 14, 15, 17, 18, 21, 23, 25, 26, 29, 32, 34, 35, 39, 65, 85]
```

For every overlapping value in the parent's array and either of the grandparent's arrays, 1 affinity is added.

The parent has ID 10 in her array, so both grandparents sharing that yields +2 total affinity. The parent's ID 147 win isn't shared, so it does nothing.

## win saddle IDs

Each value represents either a specific graded race win, or a pair of race wins that are part of an epithet.
We can look up the meaning of each win saddle ID by looking at category 111 in the text_data table:

[text\_data WHERE category = 111](https://ayaliz.github.io/hakuraku//#/masterdata?q=SELECT+%22index%22%2C+%22text%22+FROM+%22text_data%22+WHERE+category+%3D+111)

As we can see, the parent array in the previous section includes epithets like Classic Triple Crown (`1`), as well as assorted single race wins like Arima Kinen (`10`).

However, some oddities arise fairly quickly. For example, Takarazuka Kinen has an entry as both `14` and `147`. In the arrays from before, this exact issue exists - the parent ran the `147` version of Takarazuka Kinen, but the grandparents both ran the `14` version and as such won't get affinity.

It turns out this happens when an Uma has a special career version of a race. In this case, McQueen's senior year Takarazuka Kinen career goal uses a custom version of the race made just for her. Winning it yields `147` instead of `14`.

Winning the Senior Spring Triple Crown (which includes Takarazuka Kinen) on her similarly yields `145` instead of `4`, so that epithet's affinity is also lost if your grandparents have the normal version.

## Conclusion

For the purposes of the client calculation of affinity totals, special versions of career races and epithets that include them do NOT overlap with the normal versions.

This does not affect every single career race. In McQueen's case, only her Takarazuka Kinen is a custom race.

Whether this actually has implications for your spark proc chances or is just a client bug is unclear. As far as I'm aware, no dataset testing this exists, or is likely to ever exist since we're talking about 1-2 affinity differences which would require a substantial amount of data to notice.

## Verification

If you'd like to verify this yourself, attach [CalcRelationPoint.ts](attachments/CalcRelationPoint.ts) as a Frida script to the game process and watch its output while selecting parents.

In the case of the McQueen from before, selecting her as a parent for Seiun Sky yields:

```
[Relation] Total: 72 | Base: 54 | RaceBonus: 18
```

The 54 base value is expected for Seiun Sky with McQueen as a parent with Oguri Cap and El Condor Pasa as grandparents.

The 18 RaceBonus is the result of the win_saddle_id arrays listed earlier:

| ID | × Oguri Cap | × El Condor Pasa |
|----|:-----------:|:----------------:|
| 2  | -           | ✓                |
| 5  | ✓           | -                |
| 10 | ✓           | ✓                |
| 11 | -           | ✓                |
| 13 | ✓           | -                |
| 15 | ✓           | ✓                |
| 17 | ✓           | ✓                |
| 18 | -           | ✓                |
| 23 | ✓           | ✓                |
| 25 | -           | ✓                |
| 26 | ✓           | ✓                |
| 27 | ✓           | -                |
| 34 | -           | ✓                |
| **Total** | **8** | **10** |

8 + 10 = **18** race bonus affinity. The client is not counting McQueen's career Takarazuka Kinen as an overlapping race with the normal Takarazuka Kinens the other two umas ran.