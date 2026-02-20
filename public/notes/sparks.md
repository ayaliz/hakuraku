# Introduction

If you've never read crazyfellow's [parenting & gene guide](https://docs.google.com/document/d/1Q3IJKbtkplmuY-PAJMNjYiLtasv0eU0aIBEqp8_C3tg/edit?tab=t.0#heading=h.d240d0rww489), then I'd highly suggest checking it out. This note wouldn't exist without it.

## Spark probabilities

Our understanding of spark proc chances comes in large part from the great testing performed by BourBon_Polaris on Twitter.

Their [<20 affinity tests](https://x.com/BourBon_Polaris/status/1806521989198413849) provide the baseline proc chances for each type of spark.

| Spark Type | 1 Star | 2 Star | 3 Star |
|------------|:------:|:------:|:------:|
| **Pink** | 1% | 3% | 5% |
| **Green** | 5% | 10% | 15% |
| **Skill & Scenario** | 3% | 6% | 9% |
| **Race** | 1% | 2% | 3% |

Additionally, we know that Cygames filed a [patent related to the inheritance system](https://patents.google.com/patent/JP2022018121A/en).

In it, the specific formula of `(1 + sum of compatibility bonus values / 100)` appears, which we would expect to reappear somewhere when it comes to calculating the odds of a spark proccing.

crazyfellow proposes the concept of individual affinity, where this formula isn't applied using the total affinity value of your parent tree (i.e. the number used to determine double circle affinity), but on a per-parent basis, where each parent and grandparent has their own affinity value.

Specifically, each grandparent's individual affinity is her base affinity contribution to the tree + the race bonus to the parent she belongs to. Each parent's individual affinity value is the sum of her base affinity with both grandparents, the other parent, and the trained uma, as well as the race bonus from both grandparents (after the 2nd Anniversary affinity update, this also includes race bonus from the other parent).

The resulting individual affinity values combined with the base spark chances and the patent's formula turn out to be a strong predictor when it comes to real observed spark procs.

In a [follow-up analysis](https://x.com/BourBon_Polaris/status/1846520715794882863), BourBon_Polaris ran 100 inheritance trials and collected the data. 

The screenshots are kind of a nightmare to decipher if you're nihongo jouzu so I've transferred the data to a [spreadsheet](https://docs.google.com/spreadsheets/d/13fGrEQB5YRp5qJcCg38UAGLhIS3Vn_JV9dZoEooYgl8/edit?usp=sharing) for your, and my, convenience.

Individual inheritance theory is very consistently in line with the actual results. The only outlier is a single 2.8% probability of the observed result happening given the underlying probability resulting from the formula - which is actually a good result, given that in 47 individual trials we'd expect `47 * 0.05 = 2.35` trials to coincidentally be lower than 5% probability.

Given this model's strength and how intuitively it combines the patent's formula with quite reasonable assumptions about how affinity is distributed to individual parents, I feel confident saying it's either correct, or at least so close to the truth it basically doesn't matter. As such, this is what's implemented for the spark chance calculation on the [/veterans](/hakuraku/#/veterans) page.
