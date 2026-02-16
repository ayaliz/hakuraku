# Gallop.SingleModeUtils.CalcRelationPoint

This function is in charge of displaying triangle/circle/double circle as a benchmark for the total affinity of your parents.

## Race bonus

Base affinity is well understood, so I won't be talking about it here.

To derive the race bonus affinity from a parent + a grandparent pair, the game looks at their win_saddle_id_array. It'll look something like this:

```
Parent:        [1, 2, 5, 10, 11, 12, 13, 15, 16, 17, 18, 23, 25, 26, 27, 34, 63, 145, 146, 147]
Grandparent 1:  [4, 5, 6, 10, 13, 14, 15, 17, 23, 26, 27, 61, 122, 130]
Grandparent 2:  [2, 6, 7, 10, 11, 14, 15, 17, 18, 21, 23, 25, 26, 29, 32, 34, 35, 39, 65, 85]
```

For every overlapping value in the parent's array and either of the grandparent's arrays, 1 affinity is added.

The parent has ID 10 in her array, so both grandparents sharing that yields +2 affinity. The parent's ID 147 isn't shared, so it does nothing.

## win saddle IDs

Each value represents either a specific graded race win, or a pair of race wins.
We can look up the meaning of each win saddle ID by looking at category 111 in the text_data table:

[text\_data WHERE category = 111](https://ayaliz.github.io/hakuraku//#/masterdata?q=SELECT+%22index%22%2C+%22text%22+FROM+%22text_data%22+WHERE+category+%3D+111)

As we can see, the parent array in the previous section includes epithets like Classic Triple Crown (`1`), as well as assorted single race wins like Arima Kinen (`10`).

However, some oddities arise fairly quickly. For example, Takarazuka Kinen has an entry as both `14` and `147`. In the arrays from before, this exact issue exists — the parent ran the `147` version of Takarazuka Kinen, but the grandparents both ran the `14` version and as such won't get affinity.

It turns out this happens when an Uma has a special career version of a race. In this case, McQueen's senior year Takarazuka Kinen career goal uses a custom version of the race made just for her. Winning it yields `147` instead of `14`.

Winning the Senior Spring Triple Crown on her similarly yields `145` instead of `4`, so that epithet's affinity is also lost if your grandparents have the normal version.