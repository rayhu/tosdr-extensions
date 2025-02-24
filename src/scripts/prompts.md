Please create a new script: download-data.js for me to download the data from the tosdr website.

I wish this script to be able to loop through the services in the services-details.json.

By default, the file only download five services. If I append --all at the end, it shall download all the services.

For each service, I wish you to create a folder for it.

In this folder, it shall create a details.json file to store the service details data.

In this folder, it shall create a documents folder to store the documents.

Then, It shall pickup its service id.

Append the service id at the end of the url:
https://tosdr.org/en/service/{service id}

Save the retrieved the html file to the current folder.

And analyze the Documents section (service-documents class) of the html page. Find the list of links to the documents loop through them and download all the links and put the downloaded files in the documents folder..

