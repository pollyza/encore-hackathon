## W ability — circle AoE at cursor position (LoL Lux W feel).
##
## Telegraph appears for `telegraph_delay` seconds, then deals damage to all
## enemies inside `aoe_radius`. Designed to be dodgeable.
class_name AbilityWBlast
extends Ability

## Telegraph time before damage lands. 0.3-0.6s feels fair to dodge.
@export var telegraph_delay: float = 0.4

## Radius of the AoE in pixels.
@export var aoe_radius: float = 90.0

## Scene with a circle telegraph + damage trigger. See scenes/projectile_aoe.tscn.
@export var telegraph_scene: PackedScene

func _cast(caster: Node2D, target_pos: Vector2) -> bool:
    if telegraph_scene == null:
        push_error("AbilityWBlast: telegraph_scene not assigned in editor")
        return false

    var dir: Vector2 = target_pos - caster.global_position
    var dist: float = dir.length()
    if dist > ability_range:
        # Clamp to ability_range so you can't W enemies outside cast range
        target_pos = caster.global_position + dir.normalized() * ability_range

    var telegraph := telegraph_scene.instantiate()
    caster.get_parent().add_child(telegraph)
    telegraph.global_position = target_pos
    if telegraph.has_method("arm"):
        telegraph.arm(telegraph_delay, aoe_radius, damage)

    _start_cooldown()
    return true
