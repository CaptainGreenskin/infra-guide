terraform {
  required_version = ">= 1.4, < 2.0"
}

# The built-in provider stores a release contract in LOCAL state.
# It does not create a deployment, a cloud instance, or a container.
resource "terraform_data" "release" {
  input = {
    replicas = 2
    digest   = "sha256:1111111111111111111111111111111111111111111111111111111111111111"
  }
}

output "release" {
  value = terraform_data.release.output
}
