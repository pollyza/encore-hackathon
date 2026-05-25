## Base class for all hero abilities (Q / W / E / R).
##
## Design note: abilities are Resources, not Nodes — that way they're easy to
## swap, save, balance-tune, and serialize. Each hero holds a list of Ability
## resources; the Hero script calls `try_cast(caster, target_pos)` on press.
##
## Subclass this and override `_cast()` to implement specific abilities.
## See abilities/q_bolt.gd and abilities/w_blast.gd for concrete examples.
class_name Ability
extends Resource

## Display name (used by HUD).
@export var ability_name: String = "Untitled"

## Cooldown in seconds. The base class manages the timer; subclasses don't touch it.
@export var cooldown: float = 1.0

## Mana cost. Hero must have >= cost.mp to cast.
@export var mana_cost: float = 0.0

## Range in pixels. Subclasses interpret (skillshot length, AoE radius, etc).
@export var ability_range: float = 200.0

## How much damage to deal at the impact point. Subclasses decide how to apply.
@export var damage: float = 30.0

## Runtime cooldown timer (seconds remaining). Read-only externally.
var _cd_remaining: float = 0.0

## Called every frame by the hero. Pass dt (seconds since last frame).
func tick(delta: float) -> void:
    if _cd_remaining > 0.0:
        _cd_remaining = max(0.0, _cd_remaining - delta)

## Returns true if the ability is ready to cast.
func is_ready() -> bool:
    return _cd_remaining <= 0.0

## Cooldown ratio 0..1 for HUD display. 0 = ready, 1 = just cast.
func cooldown_ratio() -> float:
    if cooldown <= 0.0:
        return 0.0
    return _cd_remaining / cooldown

## Try to cast. Returns true if cast succeeded.
##
## `caster` is the Hero node casting; `target_pos` is world-space (typically
## mouse position). Subclasses MUST call `_start_cooldown()` after a successful
## cast or the ability will be uncooldowned.
func try_cast(caster: Node2D, target_pos: Vector2) -> bool:
    if not is_ready():
        return false
    if caster.mp < mana_cost:
        return false
    caster.mp -= mana_cost
    return _cast(caster, target_pos)

## Override in subclasses. Return true on success.
func _cast(_caster: Node2D, _target_pos: Vector2) -> bool:
    push_error("Ability._cast() must be overridden in subclass")
    return false

## Subclasses call this after a successful cast.
func _start_cooldown() -> void:
    _cd_remaining = cooldown
