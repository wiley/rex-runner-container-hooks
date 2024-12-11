#!/bin/bash

# Function to check if a directory is a git repository
is_git_repo() {
  local dir="$1"
  if [ -d "$dir/.git" ]; then
    return 0
  else
    return 1
  fi
}

# Function to find parent directories containing a git repository
find_parent_git_repos() {
  local base_dir="$1"
  local result=()

  if [ ! -d "$base_dir" ]; then
    return 0
  fi

  for sub_dir in "$base_dir"/*; do
    if [ -d "$sub_dir" ]; then
      for inner_dir in "$sub_dir"/*; do
        if [ -d "$inner_dir" ] && [ "$(basename "$sub_dir")" == "$(basename "$inner_dir")" ]; then
          if is_git_repo "$inner_dir"; then
            result+=("$inner_dir")
            break
          fi
        fi
      done
    fi
  done

  # Print the results
  for dir in "${result[@]}"; do
    echo "$(basename "$sub_dir")"
  done
}
find_parent_git_repos "$1"

