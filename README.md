
### Summary of Git Steps Performed. Fork this repo 

1. **Cloning Your Forked Repository**
   - Attempted to clone my fork(Refer to your Fork, don't use mine) (`git@github.com:Mtemi/tbb.git`) but faced a **permission error** because SSH keys weren't set up.

2. **Setting Up SSH Authentication**
   - Generated a new SSH key using `ssh-keygen`.
   - Added the key to the SSH agent with `ssh-add ~/.ssh/id_ed25519`.
   - Added the public key (`id_ed25519.pub`) to your GitHub account under SSH keys.
   - Verified the SSH setup using `ssh -T git@github.com`.

3. **Cloning Your Fork Again**
   - Successfully cloned my fork(Clone yours) after resolving SSH issues:
     ```bash
     git clone git@github.com:Mtemi/tbb.git
     ```

4. **Setting Up Upstream**
   - Added the main repository (`https://github.com/10xtraders/tbb`) as the upstream remote:
     ```bash
     git remote add upstream https://github.com/10xtraders/tbb.git
     ```

5. **Creating a New Branch**
   - Created a branch named `tbb_ui` for my changes:
     ```bash
     git checkout -b tbb_ui
     ```

6. **Making and Committing Changes**
   - Made changes to the repository.
   - Configured Git with your name and email using:
     ```bash
     git config --global user.name "Mtemi"
     git config --global user.email "bmutua350@gmail.com"
     ```
   - Staged and committed the changes:
     ```bash
     git add .
     git commit -m "initial state"
     ```

7. **Pushing the Changes**
   - Initially faced a warning about the branch having no upstream.
   - Successfully pushed the changes to my fork with:
     ```bash
     git push --set-upstream origin tbb_ui
     ```

8. **Pull Request Creation**
   - GitHub provided a link to create a pull request:
     ```plaintext
     https://github.com/Mtemi/tbb/pull/new/tbb_ui
     ```

### Next Steps
1. Visit the provided link to open a pull request (PR) on GitHub.
2. The maintainer of the main repository (`10xtraders/tbb`) will review and merge your changes.
