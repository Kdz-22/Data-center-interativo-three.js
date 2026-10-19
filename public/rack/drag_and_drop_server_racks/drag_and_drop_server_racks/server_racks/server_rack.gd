extends StaticBody3D

# does this game obect start off destroyed?
@export var is_destroyed = false

func _ready():
	if is_destroyed:
		destroy_rack()
	else:
		$rack_mesh.show()
		$rack_mesh_destroyed.hide()

# modifies this game object to look destroyed
func destroy_rack():
	$collider_upper.queue_free()
	$rack_mesh.queue_free()
	$rack_mesh_destroyed.show()
	
