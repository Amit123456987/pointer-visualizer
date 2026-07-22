/* ========== EXAMPLES (real C++) ========== */
const EXAMPLES = {
  "Pointers & dereference": `#include <iostream>
using namespace std;

int main() {
    int a = 42;
    int b = 7;
    int* pa = &a;
    int* pb = &b;
    *pa = 100;
    *pb = *pa;
    cout << a;
    cout << b;
    return 0;
}`,

  "Linked list": `#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

int main() {
    Node* head = new Node;
    head->data = 10;
    head->next = new Node;
    head->next->data = 20;
    head->next->next = new Node;
    head->next->next->data = 30;
    head->next->next->next = nullptr;

    Node* curr = head;
    while (curr != nullptr) {
        cout << curr->data;
        curr = curr->next;
    }
    return 0;
}`,

  "Binary tree": `#include <iostream>
using namespace std;

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
};

int main() {
    TreeNode* root = new TreeNode;
    root->val = 8;
    root->left = new TreeNode;
    root->left->val = 3;
    root->left->left = new TreeNode;
    root->left->left->val = 1;
    root->left->right = new TreeNode;
    root->left->right->val = 6;
    root->right = new TreeNode;
    root->right->val = 10;
    root->right->right = new TreeNode;
    root->right->right->val = 14;

    TreeNode* cursor = root->left;
    cout << cursor->val;
    return 0;
}`,

  "Graph (adjacency list)": `#include <iostream>
using namespace std;

struct GNode {
    int id;
    GNode* edge1;
    GNode* edge2;
};

int main() {
    GNode* A = new GNode;
    GNode* B = new GNode;
    GNode* C = new GNode;
    GNode* D = new GNode;
    A->id = 1; B->id = 2; C->id = 3; D->id = 4;
    A->edge1 = B; A->edge2 = D;
    B->edge1 = C; B->edge2 = nullptr;
    C->edge1 = A; C->edge2 = nullptr;
    D->edge1 = C; D->edge2 = nullptr;

    GNode* start = A;
    cout << start->id;
    cout << start->edge1->id;
    return 0;
}`,

  "For-loop iteration": `#include <iostream>
using namespace std;

int main() {
    int arr[5];
    arr[0] = 2;
    arr[1] = 4;
    arr[2] = 6;
    arr[3] = 8;
    arr[4] = 10;

    for (int i = 0; i < 5; i = i + 1) {
        int x = arr[i];
        cout << x;
    }
    return 0;
}`,

  "Longest substring (no repeat)": `#include <iostream>
using namespace std;

// Sliding window: longest substring without repeating characters
// Example: "abcabcbb" → 3  ("abc")
int lengthOfLongestSubstring(string s) {
    int n = s.length();
    int last[128];
    for (int i = 0; i < 128; i = i + 1) {
        last[i] = -1;
    }
    int left = 0;
    int best = 0;
    for (int right = 0; right < n; right = right + 1) {
        int ch = s[right];
        if (last[ch] >= left) {
            left = last[ch] + 1;
        }
        last[ch] = right;
        int len = right - left + 1;
        if (len > best) {
            best = len;
        }
    }
    return best;
}

int main() {
    string s = "abcabcbb";
    int ans = lengthOfLongestSubstring(s);
    cout << ans;
    return 0;
}`,

  "Number of LIS (LeetCode 673)": `#include <iostream>
using namespace std;

// LeetCode 673: count longest increasing subsequences
// Original uses vector + class Solution; adapted here to plain arrays.
int nums[5];

int findNumberOfLIS(int n) {
    int length[20];
    int count[20];

    for (int i = 0; i < n; i = i + 1) {
        length[i] = 1;
        count[i] = 1;
    }

    for (int i = 0; i < n; i = i + 1) {
        for (int j = 0; j < i; j = j + 1) {
            if (nums[j] < nums[i]) {
                if (length[j] + 1 > length[i]) {
                    length[i] = length[j] + 1;
                    count[i] = 0;
                }
                if (length[j] + 1 == length[i]) {
                    count[i] = count[i] + count[j];
                }
            }
        }
    }

    int maxLength = length[0];
    for (int i = 1; i < n; i = i + 1) {
        if (length[i] > maxLength) {
            maxLength = length[i];
        }
    }

    int result = 0;
    for (int i = 0; i < n; i = i + 1) {
        if (length[i] == maxLength) {
            result = result + count[i];
        }
    }

    return result;
}

int main() {
    // [1, 3, 5, 4, 7] has 2 LIS of length 4: [1,3,4,7] and [1,3,5,7]
    nums[0] = 1;
    nums[1] = 3;
    nums[2] = 5;
    nums[3] = 4;
    nums[4] = 7;

    int ans = findNumberOfLIS(5);
    cout << ans;
    return 0;
}`,

  "Number of LIS — memo DFS (LeetCode 673)": `#include <iostream>
using namespace std;

// LeetCode 673 — memoized DFS version (class Solution + vector + lambda adapted)
int nums[5];
int length[20];
int count[20];

void calculateDP(int i) {
    if (length[i] != 0) {
        return;
    }

    length[i] = 1;
    count[i] = 1;

    for (int j = 0; j < i; j = j + 1) {
        if (nums[j] < nums[i]) {
            calculateDP(j);
            if (length[j] + 1 > length[i]) {
                length[i] = length[j] + 1;
                count[i] = 0;
            }
            if (length[j] + 1 == length[i]) {
                count[i] = count[i] + count[j];
            }
        }
    }
}

int findNumberOfLIS(int n) {
    for (int k = 0; k < n; k = k + 1) {
        length[k] = 0;
        count[k] = 0;
    }

    int maxLength = 0;
    for (int i = 0; i < n; i = i + 1) {
        calculateDP(i);
        if (length[i] > maxLength) {
            maxLength = length[i];
        }
    }

    int result = 0;
    for (int i = 0; i < n; i = i + 1) {
        if (length[i] == maxLength) {
            result = result + count[i];
        }
    }

    return result;
}

int main() {
    // [1, 3, 5, 4, 7] -> 2 (same as iterative DP)
    nums[0] = 1;
    nums[1] = 3;
    nums[2] = 5;
    nums[3] = 4;
    nums[4] = 7;

    int ans = findNumberOfLIS(5);
    cout << ans;
    return 0;
}`,

  "Unique BSTs (Catalan)": `#include <iostream>
using namespace std;

// Count unique Binary Search Trees for n keys (Catalan numbers).
// For n = 3 the answer is 5.
int numTrees(int n)
{
    // Base case
    if (n <= 1)
        return 1;

    int ans = 0;

    // Try every node as the root.
    for (int root = 1; root <= n; root = root + 1)
    {
        // Count BSTs formed by the left and right subtrees.
        int leftCount = numTrees(root - 1);
        int rightCount = numTrees(n - root);
        ans = ans + leftCount * rightCount;
    }

    // Return the total number of unique BSTs.
    return ans;
}

int main()
{
    int n = 3;

    int result = numTrees(n);
    cout << result;

    return 0;
}`,

  "Max rectangle in binary matrix": `#include <iostream>
using namespace std;

// Maximum area rectangle of 1s in a binary matrix (histogram + stack).
// Original uses vector/stack/max; adapted to plain 2D arrays for this visualizer.
// Example matrix answer: 8
int mat[4][4];
int heights[8];
int st[20];
int top;

int getMaxArea(int m)
{
    top = -1;
    int res = 0;

    for (int i = 0; i < m; i = i + 1)
    {
        // Process bars that are taller or equal to the current bar.
        while (top >= 0 && heights[st[top]] >= heights[i])
        {
            int tp = st[top];
            top = top - 1;

            int width;
            if (top < 0)
                width = i;
            else
                width = i - st[top] - 1;

            int area = heights[tp] * width;
            if (area > res)
                res = area;
        }
        top = top + 1;
        st[top] = i;
    }

    // Process remaining bars.
    while (top >= 0)
    {
        int tp = st[top];
        top = top - 1;

        int width;
        if (top < 0)
            width = m;
        else
            width = m - st[top] - 1;

        int area = heights[tp] * width;
        if (area > res)
            res = area;
    }

    return res;
}

int maxArea(int n, int m)
{
    for (int j = 0; j < m; j = j + 1)
        heights[j] = 0;

    int ans = 0;

    for (int i = 0; i < n; i = i + 1)
    {
        for (int j = 0; j < m; j = j + 1)
        {
            if (mat[i][j] == 1)
                heights[j] = heights[j] + 1;
            else
                heights[j] = 0;
        }

        int area = getMaxArea(m);
        if (area > ans)
            ans = area;
    }

    return ans;
}

int main()
{
    // 4x4 matrix:
    // 0 1 1 0
    // 1 1 1 1
    // 1 1 1 1
    // 1 1 0 0
    int n = 4;
    int m = 4;

    mat[0][0] = 0; mat[0][1] = 1; mat[0][2] = 1; mat[0][3] = 0;
    mat[1][0] = 1; mat[1][1] = 1; mat[1][2] = 1; mat[1][3] = 1;
    mat[2][0] = 1; mat[2][1] = 1; mat[2][2] = 1; mat[2][3] = 1;
    mat[3][0] = 1; mat[3][1] = 1; mat[3][2] = 0; mat[3][3] = 0;

    int result = maxArea(n, m);
    cout << result;

    return 0;
}`,

  "Max rectangle (memo widths)": `#include <iostream>
using namespace std;

// Maximum area rectangle of 1s using consecutive-width memoization.
// Original uses vector/min/max/ternary; adapted to plain 2D arrays for this visualizer.
// Example matrix answer: 8
int mat[4][4];
int memo[4][4];

int maxArea(int n, int m)
{
    for (int i = 0; i < n; i = i + 1)
    {
        for (int j = 0; j < m; j = j + 1)
            memo[i][j] = 0;
    }

    int ans = 0;

    for (int i = 0; i < n; i = i + 1)
    {
        for (int j = 0; j < m; j = j + 1)
        {
            if (mat[i][j] != 0)
            {
                // Width of consecutive 1s ending at (i, j).
                if (j == 0)
                    memo[i][j] = 1;
                else
                    memo[i][j] = memo[i][j - 1] + 1;

                int width = memo[i][j];

                // Expand upward; keep the minimum width so far.
                for (int k = i; k >= 0; k = k - 1)
                {
                    if (memo[k][j] < width)
                        width = memo[k][j];

                    int area = width * (i - k + 1);
                    if (area > ans)
                        ans = area;
                }
            }
        }
    }

    return ans;
}

int main()
{
    // 4x4 matrix:
    // 0 1 1 0
    // 1 1 1 1
    // 1 1 1 1
    // 1 1 0 0
    int n = 4;
    int m = 4;

    mat[0][0] = 0; mat[0][1] = 1; mat[0][2] = 1; mat[0][3] = 0;
    mat[1][0] = 1; mat[1][1] = 1; mat[1][2] = 1; mat[1][3] = 1;
    mat[2][0] = 1; mat[2][1] = 1; mat[2][2] = 1; mat[2][3] = 1;
    mat[3][0] = 1; mat[3][1] = 1; mat[3][2] = 0; mat[3][3] = 0;

    int result = maxArea(n, m);
    cout << result;

    return 0;
}`,

  "Unique BSTs — DP (Catalan)": `#include <iostream>
using namespace std;

// Count unique Binary Search Trees for n keys using bottom-up DP.
// Original uses VLA int dp[n+1]; fixed-size array used here for this visualizer.
// For n = 3 the answer is 5.
int numTrees(int n)
{
    // dp[i] = number of unique BSTs with i nodes.
    int dp[20];

    // Base cases.
    dp[0] = 1;
    dp[1] = 1;

    // Fill dp[] bottom-up.
    for (int i = 2; i <= n; i = i + 1)
    {
        dp[i] = 0;

        // Try every node as the root.
        for (int j = 1; j <= i; j = j + 1)
        {
            // Left: j-1 nodes, right: i-j nodes.
            dp[i] = dp[i] + dp[j - 1] * dp[i - j];
        }
    }

    return dp[n];
}

int main()
{
    int n = 3;

    int result = numTrees(n);
    cout << result;

    return 0;
}`,
};
