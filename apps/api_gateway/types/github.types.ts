export type Push = {

    repository: {
        name: string;
        owner: {
            login: string;
        };
    };
    ref: string;
    after: string;
}

export type PR = {
    repository: {
        name: string;
        owner: {
            login: string;
        };
    };
    pull_request: {
        head: {
            ref: string;
            sha: string;
        }
    }
}

export type normalized_payload = {
    eventType: "push" | "pull_request",
    repoName: string,
    repoOwner: string,
    branch: string,
    commitSha: string,
} 