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
};
