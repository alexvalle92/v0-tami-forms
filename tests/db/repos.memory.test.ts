import { createMemoryRepos } from "../fakes/memory-repos"
import { defineRepoContract } from "./repos.contract"

defineRepoContract("memory", async () => createMemoryRepos())
