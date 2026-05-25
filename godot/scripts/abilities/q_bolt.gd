## Q ability — straight-line skillshot bolt.
##
## Spawns a Projectile node that travels in the cast direction at fixed speed
## until it hits an enemy / minion / dragon, or reaches max range.
##
## Tunable via the @export vars in the editor (right-click q_bolt.gd > Save
## as Resource, then edit the values per-hero).
class_name AbilityQBolt
extends Ability

## Projectile speed in pixels/second.
@export var projectile_speed: float = 560.0

## Hit radius in pixels. Cone of projectile-vs-enemy collision check.
@export var projectile_radius: float = 16.0

## Auto-aim cone in degrees. If an enemy is within ±this angle of the cast
## direction and within ability_range, the bolt snaps to them. Set to 0 for
## strict aim, 25-30 for forgiving aim.
@export var aim_assist_cone_deg: float = 25.0

## Scene to instance on cast. Set this in the editor to your projectile scene
## (created via right-click > New Scene > CharacterBody2D / Area2D root).
@export var projectile_scene: PackedScene

func _cast(caster: Node2D, target_pos: Vector2) -> bool:
    if projectile_scene == null:
        push_error("AbilityQBolt: projectile_scene not assigned in editor")
        return false

    var dir: Vector2 = (target_pos - caster.global_position).normalized()
    if dir == Vector2.ZERO:
        return false

    # Aim assist: snap dir toward nearest enemy in cone if there is one.
    dir = _apply_aim_assist(caster, dir)

    var projectile := projectile_scene.instantiate()
    caster.get_parent().add_child(projectile)
    projectile.global_position = caster.global_position
    if projectile.has_method("launch"):
        projectile.launch(dir, projectile_speed, ability_range, damage, projectile_radius)

    _start_cooldown()
    return true

## Look at all enemies in caster's parent; if one is within range and within
## the aim cone, return the direction toward them instead of the raw dir.
func _apply_aim_assist(caster: Node2D, dir: Vector2) -> Vector2:
    var cone_cos: float = cos(deg_to_rad(aim_assist_cone_deg))
    var best_dot: float = cone_cos
    var best_dir: Vector2 = dir
    var origin: Vector2 = caster.global_position
    for node in caster.get_tree().get_nodes_in_group("enemies"):
        if not node is Node2D or node == caster:
            continue
        var to_enemy: Vector2 = (node as Node2D).global_position - origin
        var dist: float = to_enemy.length()
        if dist < 1.0 or dist > ability_range:
            continue
        var enemy_dir: Vector2 = to_enemy / dist
        var d: float = dir.dot(enemy_dir)
        if d > best_dot:
            best_dot = d
            best_dir = enemy_dir
    return best_dir
