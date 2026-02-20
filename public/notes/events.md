# Race events

Some documentation on the parameters and quirks of race events.

## Basics

Race events are how we know about skill usage, as well as the activation of dueling, spot struggle, and some future modes yet to be added to global.

A race event may look like this for a skill:

```json
{
    "eventSize": 26,
    "event": {
        "frameTime": 0,
        "type": "SKILL",
        "paramCount": 5,
        "param": [0, 200162, -1, 0, 0]
    }
}
```

Or this for spot struggle (similar for dueling, just a different type):

```json
{
    "eventSize": 10,
    "event": {
        "frameTime": 7.725593566894531,
        "type": "COMPETE_TOP",
        "paramCount": 1,
        "param": [7]
    }
}
```

The raw event data can be browsed at the bottom of the [/racedata](/hakuraku/#/racedata) page when a race has been loaded.

## Params

`COMPETE_TOP` (spot struggle) and `COMPETE_FIGHT` (dueling) events only feature one parameter, which is a bitmask of the umas who entered the spot struggle/dueling state that frame.

Using the `COMPETE_TOP` example above, the parameter `7` is the bitmask `000000111` for a 9-uma race, meaning all umas in the last three starting gates start spot struggling here.

`SKILL` events feature a total of 5 parameters:

| Param | Description |
|-------|-------------|
| `param[0]` | Which uma used the skill. 0-indexed, so `0` is the uma who started in gate 1. |
| `param[1]` | The skill ID. |
| `param[2]` | The skill duration in milliseconds. |
| `param[3]` | Purpose unclear - has been `0` in all observed events. |
| `param[4]` | Target bitmask for which umas were affected by this skill. |

## Quirks

All `SKILL` events that happen at `frameTime 0` have `-1` as their duration, so we can't rely on it for skills like Early Lead/Groundwork. [/racedata](/hakuraku/#/racedata) calculates skill durations manually due to this.

For skills with multiple effects like Keen Eye, the target bitmask is only provided for effect 1. This is why in-game, Keen Eye does not cause the purple debuff particle effect a skill like Dominator has - the client only knows that the user healed her HP, not who was debuffed.
