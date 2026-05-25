## AoE Telegraph — circle that shows for `delay` seconds, then deals damage to
## all enemies inside `radius`.
##
## Spawned by AbilityWBlast. Call `arm(delay, radius, damage)` once after
## instancing; the node manages timing + impact itself.
class_name AoeTelegraph
extends Node2D

var _delay: float = 0.4
var _radius: float = 90.0
var _damage: float = 50.0
var _t: float = 0.0
var _exploded: bool = false

func arm(delay: float, radius: float, damage: float) -> void:
    _delay = delay
    _radius = radius
    _damage = damage
    queue_redraw()

func _physics_process(delta: float) -> void:
    if _exploded:
        return
    _t += delta
    if _t >= _delay:
        _explode()
    queue_redraw()

func _draw() -> void:
    # Telegraph: filled translucent + outlined ring; brightens as it nears trigger
    var ratio: float = clamp(_t / _delay, 0.0, 1.0)
    var fill_color := Color(1.0, 0.5, 0.2, 0.18 + ratio * 0.3)
    var outline_color := Color(1.0, 0.6, 0.2, 0.7 + ratio * 0.3)
    draw_circle(Vector2.ZERO, _radius, fill_color)
    draw_arc(Vector2.ZERO, _radius, 0.0, TAU, 48, outline_color, 2.0, true)

func _explode() -> void:
    _exploded = true
    for enemy in get_tree().get_nodes_in_group("enemies"):
        if not enemy is Node2D:
            continue
        if global_position.distance_squared_to((enemy as Node2D).global_position) <= _radius * _radius:
            if enemy.has_method("take_damage"):
                enemy.take_damage(_damage, self)
    # Auto-cleanup after a short fade window so the explosion is visible
    await get_tree().create_timer(0.15).timeout
    queue_free()
